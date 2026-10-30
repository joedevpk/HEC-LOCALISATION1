import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_DISTANCE_MISMATCH,
  classifyProxyFailure,
  fetchWalkingRoute,
  isWalkingRouterConfigured,
  parseOrs,
  polylineLengthMeters,
  resolveWalkingRouter,
  WalkingRouteError,
} from '../walking-route';

const proxy = { provider: 'proxy' as const, baseUrl: 'https://p.supabase.co/functions/v1/route-walking', anonKey: 'ANON' };
const A: [number, number] = [15.3, -4.32];
const B: [number, number] = [15.31, -4.33];
const line: [number, number][] = [[15.3, -4.32], [15.305, -4.325], [15.31, -4.33]];
const geoLen = polylineLengthMeters(line);
const body = (distance: number) => ({
  features: [{ geometry: { coordinates: line }, properties: { summary: { distance, duration: 1100 }, segments: [{ steps: [{ instruction: 'Marchez' }] }] } }],
});
const res = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

afterEach(() => vi.restoreAllMocks());

describe('configuration du proxy', () => {
  it('proxy : URL de la fonction déduite de Supabase, exige la clé anon', () => {
    const env = { VITE_ROUTING_PROVIDER: 'proxy', VITE_SUPABASE_URL: 'https://p.supabase.co/', VITE_SUPABASE_ANON_KEY: 'ANON' };
    expect(resolveWalkingRouter(env)).toEqual({ provider: 'proxy', baseUrl: 'https://p.supabase.co/functions/v1/route-walking', anonKey: 'ANON' });
    expect(resolveWalkingRouter({ ...env, VITE_SUPABASE_ANON_KEY: '' }).provider).toBe('none');
    expect(resolveWalkingRouter({ VITE_ROUTING_PROVIDER: 'proxy' }).provider).toBe('none');
    expect(isWalkingRouterConfigured(proxy)).toBe(true);
  });
  it('migration : l’ancien mode ors + clé VITE continue de fonctionner', () => {
    expect(resolveWalkingRouter({ VITE_ROUTING_PROVIDER: 'ors', VITE_ROUTING_API_KEY: 'k' })).toEqual({ provider: 'ors', apiKey: 'k' });
  });
  it('en mode proxy, la clé ORS VITE_ROUTING_API_KEY est ignorée (jamais embarquée)', () => {
    const c = resolveWalkingRouter({ VITE_ROUTING_PROVIDER: 'proxy', VITE_SUPABASE_URL: 'https://p.supabase.co', VITE_SUPABASE_ANON_KEY: 'ANON', VITE_ROUTING_API_KEY: 'ORS-SECRET' });
    expect(JSON.stringify(c)).not.toContain('ORS-SECRET');
  });
});

describe('appel du proxy', () => {
  it('trajet valide : envoie seulement from/to + jeton anon, renvoie tracé, distance et durée du moteur', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(res(body(Math.round(geoLen))));
    const r = await fetchWalkingRoute(A, B, { config: proxy });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(proxy.baseUrl);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ from: A, to: B });
    expect((init as RequestInit).headers).toMatchObject({ apikey: 'ANON' });
    expect(r.source).toBe('external');
    expect(r.coordinates).toEqual(line);
    expect(r.durationMinutes).toBe(Math.round(1100 / 60));
    expect(r.distanceMeters).toBe(Math.round(geoLen));
  });
  it('distance annoncée incohérente avec le tracé : la géométrie fait foi', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(res(body(geoLen * (1 + MAX_DISTANCE_MISMATCH + 0.5))));
    const r = await fetchWalkingRoute(A, B, { config: proxy });
    expect(r.distanceMeters).toBeCloseTo(geoLen, 3);
  });
  it('distance cohérente : valeur du moteur conservée', () => {
    const r = parseOrs(body(geoLen * 1.05));
    expect(r.distanceMeters).toBeCloseTo(geoLen * 1.05, 3);
  });
  it('coordonnées invalides : aucune requête réseau', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(fetchWalkingRoute([999, 0], B, { config: proxy })).rejects.toMatchObject({ kind: 'invalid_points' });
    expect(spy).not.toHaveBeenCalled();
  });
  it.each([
    [429, { error: { kind: 'rate_limited', message: 'Quota atteint' } }, 'rate_limited'],
    [404, { error: { kind: 'no_route', message: 'Aucun chemin' } }, 'no_route'],
    [422, { error: { kind: 'out_of_area', message: 'Hors zone' } }, 'out_of_area'],
    [422, { error: { kind: 'too_far', message: 'Trop long' } }, 'too_far'],
    [503, { error: { kind: 'not_configured', message: 'Non configuré' } }, 'not_configured'],
    [502, { error: { kind: 'service_misconfigured', message: 'Clé refusée' } }, 'bad_request'],
    [503, { error: { kind: 'upstream_unavailable', message: 'Indisponible' } }, 'service_unavailable'],
    [504, { error: { kind: 'timeout', message: 'Délai' } }, 'timeout'],
  ])('HTTP %i du proxy → erreur explicite « %s »', async (status, b, kind) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(res(b, status));
    await expect(fetchWalkingRoute(A, B, { config: proxy })).rejects.toMatchObject({ kind });
  });
  it('401/403 de la passerelle (sans corps proxy) : forbidden, jamais « aucun chemin »', async () => {
    for (const s of [401, 403]) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res({ message: 'Invalid JWT' }, s));
      await expect(fetchWalkingRoute(A, B, { config: proxy })).rejects.toMatchObject({ kind: 'forbidden' });
    }
  });
  it('404 sans corps proxy : fonction non déployée (not_configured), pas « aucun chemin »', () => {
    expect(classifyProxyFailure(404, undefined).kind).toBe('not_configured');
  });
  it('réseau indisponible', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchWalkingRoute(A, B, { config: proxy })).rejects.toMatchObject({ kind: 'network_error' });
  });
  it('réponse 200 sans tracé : invalid_response, aucun faux itinéraire', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(res({ features: [] }));
    await expect(fetchWalkingRoute(A, B, { config: proxy })).rejects.toMatchObject({ kind: 'no_route' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(res({ features: [{ geometry: { coordinates: [[15.3, -4.32]] } }] }));
    await expect(fetchWalkingRoute(A, B, { config: proxy })).rejects.toBeInstanceOf(WalkingRouteError);
  });
  it('changement de destination pendant un calcul : l’ancienne requête est annulée (abort), pas de réponse obsolète', async () => {
    const resolvers: Array<(r: Response) => void> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_u, init) =>
        new Promise<Response>((resolve, reject) => {
          resolvers.push(resolve);
          (init as RequestInit).signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const c1 = new AbortController();
    const first = fetchWalkingRoute(A, B, { config: proxy, signal: c1.signal });
    const firstResult = first.then(() => 'resolved', (e: WalkingRouteError) => e.kind);
    c1.abort(); // l'utilisateur a changé de destination
    const C: [number, number] = [15.32, -4.34];
    const lineC: [number, number][] = [[15.3, -4.32], [15.31, -4.33], [15.32, -4.34]];
    const second = fetchWalkingRoute(A, C, { config: proxy });
    resolvers[1](res({ features: [{ geometry: { coordinates: lineC }, properties: { summary: { distance: 3100, duration: 2200 }, segments: [] } }] }));
    await expect(firstResult).resolves.toBe('abort');
    await expect(second).resolves.toMatchObject({ source: 'external' });
  });
});
