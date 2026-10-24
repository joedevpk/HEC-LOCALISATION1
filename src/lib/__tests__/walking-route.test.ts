import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWalkingRoute,
  isWalkingRouterConfigured,
  parseOrs,
  parseOsrm,
  resolveWalkingRouter,
} from '../walking-route';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const A: [number, number] = [15.30, -4.32];
const B: [number, number] = [15.31, -4.33];
const ors = { provider: 'ors' as const, apiKey: 'TEST' };
const osrm = { provider: 'osrm' as const, baseUrl: 'https://osrm.example.org' };

// Réponses FICTIVES au format des moteurs.
const orsBody = {
  features: [{
    geometry: { coordinates: [[15.30, -4.32], [15.305, -4.325], [15.31, -4.33]] },
    properties: { summary: { distance: 1520, duration: 1094 }, segments: [{ steps: [{ instruction: 'Marchez vers le nord' }, { instruction: 'Vous êtes arrivé' }] }] },
  }],
};
const osrmBody = {
  code: 'Ok',
  routes: [{
    distance: 1500, duration: 1080,
    geometry: { coordinates: [[15.30, -4.32], [15.31, -4.33]] },
    legs: [{ steps: [{ name: 'Avenue Test', distance: 1500, maneuver: { type: 'depart' } }, { name: '', distance: 0, maneuver: { type: 'arrive' } }] }],
  }],
};

describe('configuration', () => {
  it('non configuré par défaut ; ors exige une clé ; osrm exige une URL http(s)', () => {
    expect(resolveWalkingRouter({}).provider).toBe('none');
    expect(resolveWalkingRouter({ VITE_ROUTING_PROVIDER: 'ors' }).provider).toBe('none');
    expect(resolveWalkingRouter({ VITE_ROUTING_PROVIDER: 'ors', VITE_ROUTING_API_KEY: 'k' }).provider).toBe('ors');
    expect(resolveWalkingRouter({ VITE_ROUTING_PROVIDER: 'osrm', VITE_ROUTING_URL: 'pas-une-url' }).provider).toBe('none');
    expect(resolveWalkingRouter({ VITE_ROUTING_PROVIDER: 'osrm', VITE_ROUTING_URL: 'https://r.example/' })).toEqual({ provider: 'osrm', baseUrl: 'https://r.example' });
    expect(isWalkingRouterConfigured({ provider: 'none' })).toBe(false);
  });
});

describe('parseurs', () => {
  it('ORS : tracé, distance, durée en minutes, étapes', () => {
    const r = parseOrs(orsBody);
    expect(r.coordinates).toHaveLength(3);
    expect(r.distanceMeters).toBe(1520);
    expect(r.durationMinutes).toBe(18);
    expect(r.steps).toEqual(['Marchez vers le nord', 'Vous êtes arrivé']);
    expect(r.source).toBe('external');
  });
  it('OSRM : étapes en français', () => {
    const r = parseOsrm(osrmBody);
    expect(r.steps[0]).toBe('Partez sur Avenue Test (1500 m)');
    expect(r.steps[1]).toBe('Vous êtes arrivé.');
  });
  it('tracé invalide ou absent → erreur, jamais une ligne inventée', () => {
    expect(() => parseOrs({ features: [{ geometry: { coordinates: [[500, 200], [1, 1]] }, properties: {} }] })).toThrow();
    expect(() => parseOrs({ features: [] })).toThrow();
    expect(() => parseOsrm({ code: 'NoRoute' })).toThrow();
  });
});

describe('fetchWalkingRoute', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('non configuré / points invalides / trop long : erreurs explicites sans réseau', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(fetchWalkingRoute(A, B, { config: { provider: 'none' } })).rejects.toMatchObject({ kind: 'not_configured' });
    await expect(fetchWalkingRoute([500, 0], B, { config: ors })).rejects.toMatchObject({ kind: 'invalid_points' });
    await expect(fetchWalkingRoute(A, [16.5, -4.32], { config: ors })).rejects.toMatchObject({ kind: 'too_far' });
    expect(f).not.toHaveBeenCalled();
  });

  it('ORS : POST foot-walking avec clé en en-tête Authorization', async () => {
    const f = vi.fn().mockResolvedValue(json(orsBody));
    vi.stubGlobal('fetch', f);
    const r = await fetchWalkingRoute(A, B, { config: ors });
    expect(r.durationMinutes).toBe(18);
    expect(String(f.mock.calls[0][0])).toContain('/v2/directions/foot-walking/geojson');
    expect((f.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'TEST' });
  });

  it('OSRM : profil foot sur l’instance configurée', async () => {
    const f = vi.fn().mockResolvedValue(json(osrmBody));
    vi.stubGlobal('fetch', f);
    await fetchWalkingRoute(A, B, { config: osrm });
    expect(String(f.mock.calls[0][0])).toContain('https://osrm.example.org/route/v1/foot/15.3,-4.32;15.31,-4.33');
  });

  it('distingue refus, quota, pas de chemin et panne réseau', async () => {
    const cases: Array<[number, string]> = [[403, 'forbidden'], [429, 'rate_limited'], [404, 'no_route'], [503, 'network_error']];
    for (const [status, kind] of cases) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, status)));
      await expect(fetchWalkingRoute(A, B, { config: ors })).rejects.toMatchObject({ kind });
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(fetchWalkingRoute(A, B, { config: ors })).rejects.toMatchObject({ kind: 'network_error' });
  });
});
