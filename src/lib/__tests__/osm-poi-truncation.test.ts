import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchExternalPOIs, isPoiResultTruncated, resetPoiCaches, splitBbox } from '../osm-poi';

// Données et URL FICTIVES de test : prouvent la logique, pas le comportement des vrais serveurs.
const A = 'https://a.overpass.test/api/interpreter';
const bbox = { west: 15.3, south: -4.33, east: 15.31, north: -4.32 };
const LIMIT = 200; // valeur par défaut de VITE_POI_RESULT_LIMIT
const node = (id: number, lat = -4.325, lon = 15.305) => ({
  type: 'node',
  id,
  lat,
  lon,
  tags: { name: `Pharmacie ${id}`, amenity: 'pharmacy' },
});
const body = (elements: unknown[]) =>
  JSON.stringify({ version: 0.6, osm3s: { timestamp_osm_base: new Date().toISOString() }, elements });
const ok = (elements: unknown[]) => new Response(body(elements), { status: 200 });
const many = (from: number, n: number) => Array.from({ length: n }, (_, i) => node(from + i));

describe('splitBbox', () => {
  it('découpe une zone en 4 quadrants qui la recouvrent exactement', () => {
    const q = splitBbox(bbox);
    expect(q).toHaveLength(4);
    expect(Math.min(...q.map((b) => b.west))).toBe(bbox.west);
    expect(Math.max(...q.map((b) => b.east))).toBe(bbox.east);
    expect(Math.min(...q.map((b) => b.south))).toBe(bbox.south);
    expect(Math.max(...q.map((b) => b.north))).toBe(bbox.north);
  });
});

describe('Overpass — résultats tronqués', () => {
  beforeEach(() => resetPoiCaches());
  afterEach(() => vi.unstubAllGlobals());

  it('moins que la limite : une seule requête, zone non signalée incomplète', async () => {
    const f = vi.fn(async () => ok(many(1, 5)));
    vi.stubGlobal('fetch', f);
    const pois = await fetchExternalPOIs(bbox, undefined, { endpoints: [A] });
    expect(pois).toHaveLength(5);
    expect(f).toHaveBeenCalledTimes(1);
    expect(isPoiResultTruncated(bbox)).toBe(false);
  });

  it('limite atteinte, quadrants complets : lieux fusionnés sans doublon, zone complète', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok(many(1, LIMIT)))
      .mockResolvedValueOnce(ok(many(1, 50)))
      .mockResolvedValueOnce(ok(many(40, 50)))
      .mockResolvedValueOnce(ok(many(300, 10)))
      .mockResolvedValueOnce(ok([]));
    vi.stubGlobal('fetch', f);
    const pois = await fetchExternalPOIs(bbox, undefined, { endpoints: [A] });
    expect(f).toHaveBeenCalledTimes(5);
    expect(new Set(pois.map((p) => p.id)).size).toBe(pois.length);
    expect(pois.length).toBeGreaterThan(LIMIT);
    expect(isPoiResultTruncated(bbox)).toBe(false);
  });

  it('un quadrant encore plein : la zone reste signalée incomplète', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok(many(1, LIMIT)))
      .mockResolvedValueOnce(ok(many(1, LIMIT)))
      .mockImplementation(async () => ok([])); // nouvelle Response à chaque appel (un corps ne se lit qu'une fois)
    vi.stubGlobal('fetch', f);
    await fetchExternalPOIs(bbox, undefined, { endpoints: [A] });
    expect(isPoiResultTruncated(bbox)).toBe(true);
  });

  it('429 sur un quadrant : on garde les lieux déjà obtenus, on ne réinsiste pas, zone incomplète', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok(many(1, LIMIT)))
      .mockImplementation(async () => new Response('Too Many Requests', { status: 429 }));
    vi.stubGlobal('fetch', f);
    const pois = await fetchExternalPOIs(bbox, undefined, { endpoints: [A] });
    expect(pois.length).toBeGreaterThan(0);
    expect(f).toHaveBeenCalledTimes(2);
    expect(isPoiResultTruncated(bbox)).toBe(true);
  });
});
