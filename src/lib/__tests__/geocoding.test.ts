import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GeocodeError,
  parseMapTiler,
  parseNominatim,
  resetGeocodeCache,
  resolveGeocoder,
  searchPlaces,
} from '../geocoding';

const mt = { provider: 'maptiler' as const, autocomplete: true, apiKey: 'TEST_KEY' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
// Données FICTIVES de test.
const mtBody = {
  features: [
    { id: 'poi.1', text: 'Pharmacie Test', place_name: 'Pharmacie Test, Rue X, Kinshasa', center: [15.3, -4.32] },
    { id: 'poi.2', text: 'Coordonnées invalides', center: [500, 200] },
    { id: 'poi.1', text: 'Doublon', center: [15.31, -4.33] },
  ],
};

describe('resolveGeocoder', () => {
  it('maptiler si la carte est MapTiler avec clé ; sinon aucun', () => {
    expect(resolveGeocoder({ VITE_MAP_PROVIDER: 'maptiler', VITE_MAP_API_KEY: 'k' })).toMatchObject({ provider: 'maptiler', autocomplete: true });
    expect(resolveGeocoder({ VITE_MAP_PROVIDER: 'maptiler' }).provider).toBe('none');
    expect(resolveGeocoder({ VITE_MAP_PROVIDER: 'mapbox', VITE_MAP_API_KEY: 'k' }).provider).toBe('none');
  });
  it('nominatim jamais en autocomplétion ; VITE_GEOCODER=none désactive', () => {
    expect(resolveGeocoder({ VITE_GEOCODER: 'nominatim' })).toEqual({ provider: 'nominatim', autocomplete: false });
    expect(resolveGeocoder({ VITE_GEOCODER: 'none', VITE_MAP_PROVIDER: 'maptiler', VITE_MAP_API_KEY: 'k' }).provider).toBe('none');
  });
});

describe('parsers', () => {
  it('MapTiler : ignore coordonnées invalides et doublons', () => {
    const r = parseMapTiler(mtBody);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: 'Pharmacie Test', lng: 15.3, lat: -4.32, source: 'maptiler' });
  });
  it('Nominatim : convertit lat/lon texte et rejette (0 résultat) les coordonnées invalides', () => {
    const r = parseNominatim([
      { osm_type: 'node', osm_id: 7, lat: '-4.3', lon: '15.3', display_name: 'École Test, Gombe, Kinshasa' },
      { osm_type: 'node', osm_id: 8, lat: 'abc', lon: '15.3', display_name: 'Invalide' },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('École Test');
  });
  it('réponse de forme inattendue → erreur, jamais de résultat inventé', () => {
    expect(() => parseMapTiler({})).toThrow(GeocodeError);
    expect(() => parseNominatim({})).toThrow(GeocodeError);
  });
});

describe('searchPlaces', () => {
  beforeEach(() => resetGeocodeCache());
  afterEach(() => vi.unstubAllGlobals());

  it('requête courte : aucun appel réseau', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await searchPlaces('ab', { config: mt })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it('non configuré : erreur explicite', async () => {
    await expect(searchPlaces('pharmacie', { config: { provider: 'none', autocomplete: false } })).rejects.toMatchObject({ kind: 'not_configured' });
  });

  it('appelle MapTiler avec biais de proximité, pays et langue, puis met en cache', async () => {
    const f = vi.fn().mockResolvedValue(json(mtBody));
    vi.stubGlobal('fetch', f);
    const r1 = await searchPlaces('  pharmacie   test ', { config: mt, proximity: [15.3, -4.32] });
    const r2 = await searchPlaces('pharmacie test', { config: mt, proximity: [15.3, -4.32] });
    expect(r1).toHaveLength(1);
    expect(r2).toEqual(r1);
    expect(f).toHaveBeenCalledTimes(1);
    const url = String(f.mock.calls[0][0]);
    expect(url).toContain('api.maptiler.com/geocoding/pharmacie%20test.json');
    expect(url).toContain('proximity=15.300%2C-4.320');
    expect(url).toContain('country=cd');
    expect(url).toContain('language=fr');
  });

  it('distingue accès refusé, quota et panne', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 403)));
    await expect(searchPlaces('aaa', { config: mt })).rejects.toMatchObject({ kind: 'forbidden' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 429)));
    await expect(searchPlaces('bbb', { config: mt })).rejects.toMatchObject({ kind: 'rate_limited' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(searchPlaces('ccc', { config: mt })).rejects.toMatchObject({ kind: 'network_error' });
  });

  it('annulation par l’appelant = erreur « abort » (jamais affichée comme panne)', async () => {
    const ctrl = new AbortController();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')));
    })));
    const p = searchPlaces('annule', { config: mt, signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ kind: 'abort' });
  });
});

describe('Null Island', () => {
  it('rejette un résultat à (0,0) chez MapTiler et Nominatim', () => {
    expect(parseMapTiler({ features: [{ id: 'x', text: 'Nulle part', center: [0, 0] }] })).toHaveLength(0);
    expect(parseNominatim([{ lat: '0', lon: '0', display_name: 'Nulle part', osm_type: 'node', osm_id: 1 }])).toHaveLength(0);
  });
});
