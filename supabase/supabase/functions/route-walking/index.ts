// Supabase Edge Function « route-walking » — proxy OpenRouteService (profil foot-walking).
// La clé ORS vit UNIQUEMENT dans les secrets Supabase (ORS_API_KEY) : elle n'apparaît jamais
// dans le JavaScript du navigateur, dans une réponse, ni dans un journal.
//
// Déploiement : voir docs/ROUTING_PROXY.md.
import {
  ORS_URL,
  SlidingWindowLimiter,
  buildOrsBody,
  classifyOrsFailure,
  corsOriginFor,
  parseBbox,
  validateOrsSuccess,
  validateRequest,
  type ProxyFailure,
} from './core.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const UPSTREAM_TIMEOUT_MS = 12_000;
const limiter = new SlidingWindowLimiter(
  Number(Deno.env.get('ROUTING_RATE_PER_IP_PER_MIN')) || 20,
  Number(Deno.env.get('ROUTING_RATE_GLOBAL_PER_MIN')) || 35, // plan gratuit ORS : 40 requêtes/min
  60_000,
);

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

function failure(f: ProxyFailure, headers: Record<string, string>): Response {
  const h = { ...headers };
  if (f.retryAfterSeconds) h['Retry-After'] = String(f.retryAfterSeconds);
  return json({ error: { kind: f.kind, message: f.message } }, f.status, h);
}

Deno.serve(async (req) => {
  const allowed = corsOriginFor(req.headers.get('origin'), Deno.env.get('ALLOWED_ORIGINS'));
  const cors: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (allowed) cors['Access-Control-Allow-Origin'] = allowed;

  if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
  if (!allowed) {
    return failure({ status: 403, kind: 'service_misconfigured', message: 'Origine non autorisée.' }, cors);
  }
  if (req.method !== 'POST') {
    return failure({ status: 405, kind: 'invalid_request', message: 'Méthode non autorisée.' }, cors);
  }

  const apiKey = Deno.env.get('ORS_API_KEY');
  if (!apiKey) {
    return failure(
      { status: 503, kind: 'not_configured', message: 'Le service d’itinéraire n’est pas configuré sur le serveur.' },
      cors,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return failure({ status: 400, kind: 'invalid_request', message: 'Corps JSON illisible.' }, cors);
  }
  const v = validateRequest(body, parseBbox(Deno.env.get('ROUTING_ALLOWED_BBOX')));
  if (!v.ok) return failure(v.failure, cors);

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const gate = limiter.check(ip, Date.now());
  if (!gate.allowed) {
    return failure(
      {
        status: 429,
        kind: 'rate_limited',
        message:
          gate.scope === 'global'
            ? 'Le service d’itinéraire est très sollicité : réessayez dans un instant.'
            : 'Trop de calculs d’itinéraire : réessayez dans un instant.',
        retryAfterSeconds: gate.retryAfterSeconds,
      },
      cors,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(ORS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json', Authorization: apiKey },
      body: JSON.stringify(buildOrsBody(v.from, v.to)),
      signal: controller.signal,
    });
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      payload = undefined;
    }
    if (!res.ok) return failure(classifyOrsFailure(res.status, payload, res.headers.get('retry-after')), cors);
    const bad = validateOrsSuccess(payload);
    if (bad) return failure(bad, cors);
    return json(payload, 200, cors);
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return failure(
      aborted
        ? { status: 504, kind: 'timeout', message: 'Le moteur d’itinéraire ne répond pas (délai dépassé).' }
        : { status: 503, kind: 'upstream_unavailable', message: 'Moteur d’itinéraire injoignable.' },
      cors,
    );
  } finally {
    clearTimeout(timer);
  }
});
