import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SNAP_DISTANCE_M,
  classifyRoutingFailure,
  fetchWalkingRoute,
  parseOrs,
  parseOsrm,
} from '../walking-route';

const ors = { provider: 'ors' as const, apiKey: 'TEST' };
const osrm = { provider: 'osrm' as const, baseUrl: 'https://osrm.test.invalid' };
// Coordonnées FICTIVES de test, proches l'une de l'autre (≈ 300 m).
const A: [number, number] = [10.0, 1.0];
const B: [number, number] = [10.003, 1.0];
const orsBody = (line: [number, number][]) => ({
  features: [
    {
      geometry: { coordinates: line },
      properties: { summary: { distance: 330, duration: 240 }, segments: [{ steps: [{ instruction: 'Marchez vers l’est' }] }] },
    },
  ],
});
const osrmBody = (line: [number, number][]) => ({
  code: 'Ok',
  routes: [{ geometry: { coordinates: line }, distance: 330, duration: 240, legs: [{ steps: [] }] }],
});
const resp = (b: unknown, status: number) => new Response(JSON.stringify(b), { status });

describe('classifyRoutingFailure — « aucun chemin » ≠ « requête refusée »', () => {
  it('ORS 404 / code 2010 : aucun chemin piéton', () => {
    const e = classifyRoutingFailure('ors', 404, { error: { code: 2010, message: 'Could not find routable point within a radius of 350.0 meters' } });
    expect(e.kind).toBe('no_route');
  });
  it('ORS 400 générique : requête refusée (bad_request), PAS « aucun chemin »', () => {
    const e = classifyRoutingFailure('ors', 400, { error: { code: 2003, message: 'Parameter language is invalid' } });
    expect(e.kind).toBe('bad_request');
    expect(e.message).toContain('2003');
    expect(e.message).not.toMatch(/Aucun chemin/);
  });
  it('ORS 400 « dépasse les limites » : trajet trop long', () => {
    expect(classifyRoutingFailure('ors', 400, { error: { code: 2004, message: 'Request parameters exceed the server configuration limits' } }).kind).toBe('too_far');
  });
  it('401/403 → forbidden, 429 → rate_limited, 5xx → network_error', () => {
    expect(classifyRoutingFailure('ors', 401, {}).kind).toBe('forbidden');
    expect(classifyRoutingFailure('osrm', 403, {}).kind).toBe('forbidden');
    expect(classifyRoutingFailure('ors', 429, {}).kind).toBe('rate_limited');
    expect(classifyRoutingFailure('osrm', 503, undefined).kind).toBe('network_error');
  });
  it('OSRM : NoRoute/NoSegment = aucun chemin ; InvalidQuery = requête refusée ; 404 = URL à vérifier', () => {
    expect(classifyRoutingFailure('osrm', 400, { code: 'NoSegment' }).kind).toBe('no_route');
    expect(classifyRoutingFailure('osrm', 400, { code: 'InvalidQuery' }).kind).toBe('bad_request');
    const nf = classifyRoutingFailure('osrm', 404, undefined);
    expect(nf.kind).toBe('network_error');
    expect(nf.message).toContain('VITE_ROUTING_URL');
  });
});

describe('cohérence du tracé avec la demande', () => {
  it('accepte un tracé qui part et arrive près des points demandés', () => {
    const r = parseOrs(orsBody([A, [10.0015, 1.0], B]), { from: A, to: B });
    expect(r.coordinates[0]).toEqual(A);
    expect(r.distanceMeters).toBe(330);
  });
  it(`refuse un tracé qui commence à plus de ${MAX_SNAP_DISTANCE_M} m du départ demandé`, () => {
    const farStart: [number, number] = [10.02, 1.0]; // ≈ 2,2 km du départ demandé
    expect(() => parseOrs(orsBody([farStart, B]), { from: A, to: B })).toThrowError(/kilomètre/);
    expect(() => parseOsrm(osrmBody([A, [10.03, 1.0]]), { from: A, to: B })).toThrowError(/kilomètre/);
  });
  it('refuse une longitude/latitude inversée dans le tracé (ordre invalide)', () => {
    // lat 120 n'existe pas : un tracé [lat, lng] au lieu de [lng, lat] doit être rejeté
    expect(() => parseOrs(orsBody([[1.0, 120.0], [1.0, 120.1]]))).toThrowError(/invalide/);
  });
});

describe('fetchWalkingRoute — réponses HTTP réalistes (simulées)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ORS : coordonnées [lng, lat], profil foot-walking, clé en en-tête (jamais dans l’URL)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(orsBody([A, B]), 200));
    vi.stubGlobal('fetch', fetchMock);
    await fetchWalkingRoute(A, B, { config: ors });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/directions/foot-walking/');
    expect(url).not.toContain('TEST');
    expect((init.headers as Record<string, string>).Authorization).toBe('TEST');
    expect(JSON.parse(String(init.body)).coordinates).toEqual([A, B]);
  });

  it('ORS 404 avec corps d’erreur → « aucun chemin », jamais une ligne droite', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp({ error: { code: 2010, message: 'Could not find routable point' } }, 404)));
    await expect(fetchWalkingRoute(A, B, { config: ors })).rejects.toMatchObject({ kind: 'no_route' });
  });

  it('ORS 400 → bad_request (et non no_route)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp({ error: { code: 2003, message: 'bad param' } }, 400)));
    await expect(fetchWalkingRoute(A, B, { config: ors })).rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('OSRM : URL au format lng,lat;lng,lat et profil foot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(osrmBody([A, B]), 200));
    vi.stubGlobal('fetch', fetchMock);
    await fetchWalkingRoute(A, B, { config: osrm });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/route/v1/foot/10,1;10.003,1?');
  });

  it('un corps qui n’arrive jamais finit en délai dépassé', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: unknown, init?: RequestInit) => {
        const body = new ReadableStream({
          start(c) {
            init?.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
          },
        });
        return new Response(body, { status: 200 });
      }),
    );
    const p = fetchWalkingRoute(A, B, { config: osrm }).then(
      () => 'ok',
      (e: { kind?: string }) => e.kind,
    );
    await vi.advanceTimersByTimeAsync(16_000);
    expect(await p).toBe('timeout');
    vi.useRealTimers();
  });

  it('réponse 200 non JSON → invalid_response, pas d’itinéraire inventé', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>oups</html>', { status: 200 })));
    await expect(fetchWalkingRoute(A, B, { config: osrm })).rejects.toMatchObject({ kind: 'invalid_response' });
  });
});

describe('coordonnées (0,0) refusées', () => {
  it('un tracé contenant (0,0) est invalide', () => {
    expect(() => parseOrs(orsBody([[0, 0], [10.0, 1.0]]))).toThrowError(/invalide/);
  });
});

import { shouldKeepExternalRoute } from '../walking-route';

describe('shouldKeepExternalRoute — pas de relance sur du bruit GPS', () => {
  const origin: [number, number] = [10.0, 1.0];
  const near: [number, number] = [10.0002, 1.0]; // ≈ 22 m
  const far: [number, number] = [10.001, 1.0]; // ≈ 111 m
  const base = { last: null, pending: null, destId: 'd1', minMoveM: 40 };
  it('garde un calcul EN COURS si le départ bouge peu', () => {
    expect(shouldKeepExternalRoute({ ...base, pending: { destId: 'd1', origin }, from: near })).toBe(true);
  });
  it('garde un calcul TERMINÉ si le départ bouge peu', () => {
    expect(shouldKeepExternalRoute({ ...base, last: { destId: 'd1', origin }, from: near })).toBe(true);
  });
  it('relance si le départ a vraiment bougé ou si la destination change', () => {
    expect(shouldKeepExternalRoute({ ...base, pending: { destId: 'd1', origin }, from: far })).toBe(false);
    expect(shouldKeepExternalRoute({ ...base, last: { destId: 'autre', origin }, from: near })).toBe(false);
    expect(shouldKeepExternalRoute({ ...base, from: near })).toBe(false);
  });
});
