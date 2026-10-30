// Tests : deno test --allow-none handler.test.ts   (aucun réseau : ORS est simulé)
import { createHandler, ALLOWED_REQUEST_HEADERS } from './handler.ts';
import { corsOriginFor } from './core.ts';

const PROD = 'https://localisationhec.onrender.com';
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: attendu=${b} obtenu=${a}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const orsOk = { features: [{ geometry: { coordinates: [[15.3, -4.3], [15.31, -4.31]] }, properties: {} }] };
const mk = (env: Record<string, string>, f: (u: string, i: RequestInit) => Promise<Response>) =>
  createHandler({ env: { get: (k) => env[k] }, fetchImpl: ((u: string, i: RequestInit) => f(u, i)) as typeof fetch });
const okFetch = () => Promise.resolve(new Response(JSON.stringify(orsOk), { status: 200 }));
const post = (origin: string | null, body: unknown) =>
  new Request('http://x/route-walking', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t', ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
const pts = { from: [15.3, -4.3], to: [15.31, -4.31] };

Deno.test('OPTIONS origine Render, secret ALLOWED_ORIGINS ABSENT → 204 + CORS', async () => {
  const h = mk({ ORS_API_KEY: 'k' }, okFetch);
  const r = await h(new Request('http://x', { method: 'OPTIONS', headers: { origin: PROD, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,apikey,content-type,x-client-info' } }));
  eq(r.status, 204, 'status'); eq(r.headers.get('access-control-allow-origin'), PROD, 'ACAO');
  eq(r.headers.get('access-control-allow-headers'), ALLOWED_REQUEST_HEADERS, 'ACAH');
  ok(r.headers.get('access-control-allow-methods')!.includes('POST'), 'ACAM');
});
Deno.test('OPTIONS avec ALLOWED_ORIGINS erroné (slash final / autre site) → toujours 204 + origine prod OK', async () => {
  const h = mk({ ALLOWED_ORIGINS: 'https://autre.example/', ORS_API_KEY: 'k' }, okFetch);
  const r = await h(new Request('http://x', { method: 'OPTIONS', headers: { origin: PROD } }));
  eq(r.status, 204, 'status'); eq(r.headers.get('access-control-allow-origin'), PROD, 'ACAO');
});
Deno.test('OPTIONS origine inconnue → 204 SANS Allow-Origin (jamais 403)', async () => {
  const r = await mk({ ORS_API_KEY: 'k' }, okFetch)(new Request('http://x', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
  eq(r.status, 204, 'status'); eq(r.headers.get('access-control-allow-origin'), null, 'ACAO');
});
Deno.test('OPTIONS sans clé ORS ni JWT → 204 (préflight non bloqué par le métier)', async () => {
  const r = await mk({}, okFetch)(new Request('http://x', { method: 'OPTIONS', headers: { origin: PROD } }));
  eq(r.status, 204, 'status');
});
Deno.test('POST autorisé → 200 + CORS + tracé', async () => {
  const r = await mk({ ORS_API_KEY: 'k' }, okFetch)(post(PROD, pts));
  eq(r.status, 200, 'status'); eq(r.headers.get('access-control-allow-origin'), PROD, 'ACAO');
  ok(Array.isArray((await r.json()).features), 'features');
});
Deno.test('ORS reçoit la clé côté serveur uniquement et un corps reconstruit', async () => {
  let seen: RequestInit | undefined;
  await mk({ ORS_API_KEY: 'SECRET' }, (_u, i) => { seen = i; return okFetch(); })(post(PROD, { ...pts, injected: 1 }));
  eq((seen!.headers as Record<string, string>).Authorization, 'SECRET', 'auth'); ok(!String(seen!.body).includes('injected'), 'corps copié');
});
Deno.test('POST origine non autorisée → 403 sans ACAO, ORS jamais appelé', async () => {
  let called = false;
  const r = await mk({ ORS_API_KEY: 'k' }, () => { called = true; return okFetch(); })(post('https://evil.example', pts));
  eq(r.status, 403, 'status'); eq(r.headers.get('access-control-allow-origin'), null, 'ACAO'); ok(!called, 'ORS appelé');
});
Deno.test('Erreurs métier portent les en-têtes CORS (400, 405, 404, 502→503, 429, 500)', async () => {
  const cases: Array<[string, Request, (u: string, i: RequestInit) => Promise<Response>, number]> = [
    ['400 points', post(PROD, { from: 1, to: 2 }), okFetch, 400],
    ['405 GET', new Request('http://x', { method: 'GET', headers: { origin: PROD } }), okFetch, 405],
    ['404 no_route', post(PROD, pts), () => Promise.resolve(new Response(JSON.stringify({ error: { code: 2010 } }), { status: 404 })), 404],
    ['503 ORS 502', post(PROD, pts), () => Promise.resolve(new Response('bad gateway', { status: 502 })), 503],
    ['429 ORS', post(PROD, pts), () => Promise.resolve(new Response('{}', { status: 429, headers: { 'retry-after': '7' } })), 429],
    ['503 réseau', post(PROD, pts), () => Promise.reject(new TypeError('net')), 503],
    ['504 timeout', post(PROD, pts), () => Promise.reject(new DOMException('t', 'AbortError')), 504],
  ];
  for (const [name, req, f, st] of cases) {
    const r = await mk({ ORS_API_KEY: 'k' }, f)(req);
    eq(r.status, st, name); eq(r.headers.get('access-control-allow-origin'), PROD, `${name} ACAO`);
  }
});
Deno.test('Exception imprévue → 500 AVEC CORS (pas d’erreur CORS opaque)', async () => {
  const h = createHandler({ env: { get: (k) => { if (k === 'ORS_API_KEY') throw new Error('boom'); return undefined; } }, fetchImpl: okFetch as unknown as typeof fetch });
  const r = await h(post(PROD, pts));
  eq(r.status, 500, 'status'); eq(r.headers.get('access-control-allow-origin'), PROD, 'ACAO');
});
Deno.test('corsOriginFor : jamais "*", normalisation', () => {
  eq(corsOriginFor('*', '*'), null, 'wildcard'); eq(corsOriginFor(PROD, undefined), PROD, 'défaut');
  eq(corsOriginFor('http://localhost:5173', ' http://localhost:5173/ '), 'http://localhost:5173', 'slash');
  eq(corsOriginFor(null, undefined), null, 'sans origine');
});
