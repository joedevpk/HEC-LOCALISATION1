import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BASE_SOURCE_IDS,
  MAP_STYLE_MODES,
  MapConfigError,
  getMapStyle,
  getMapViewOptions,
  isDefaultProvider,
} from '../map-config';

// Clé FICTIVE de test.
const KEY = 'TESTKEY123';
const setEnv = (e: Record<string, string>) => {
  for (const k of [
    'VITE_MAP_PROVIDER', 'VITE_MAP_API_KEY', 'VITE_MAP_STYLE_URL', 'VITE_MAP_MAXZOOM_SATELLITE', 'VITE_MAP_MAXZOOM_VECTOR',
    ...MAP_STYLE_MODES.flatMap((m) => [`VITE_MAP_STYLE_ID_${m.toUpperCase()}`, `VITE_MAP_STYLE_URL_${m.toUpperCase()}`]),
  ]) vi.stubEnv(k, '');
  for (const [k, v] of Object.entries(e)) vi.stubEnv(k, v);
};

describe('map-config — chaque mode charge le fond prévu, sinon erreur explicite', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('sans fournisseur ou avec un fournisseur inconnu : MapConfigError claire', () => {
    setEnv({});
    expect(() => getMapStyle('plan')).toThrowError(MapConfigError);
    expect(() => getMapStyle('plan')).toThrowError(/VITE_MAP_PROVIDER/);
    setEnv({ VITE_MAP_PROVIDER: 'inconnu', VITE_MAP_API_KEY: KEY });
    expect(() => getMapStyle('plan')).toThrowError(/inconnu/);
  });

  it('MapTiler sans clé : erreur explicite, jamais une URL sans clé', () => {
    setEnv({ VITE_MAP_PROVIDER: 'maptiler' });
    expect(() => getMapStyle('satellite')).toThrowError(/VITE_MAP_API_KEY/);
  });

  it('MapTiler : les 5 modes donnent 5 styles DISTINCTS, au bon identifiant, avec la clé', () => {
    setEnv({ VITE_MAP_PROVIDER: 'maptiler', VITE_MAP_API_KEY: KEY });
    const expected: Record<string, string> = {
      plan: 'streets-v2', satellite: 'satellite', hybrid: 'hybrid', topo: 'topo-v2', dark: 'streets-v2-dark',
    };
    const urls = MAP_STYLE_MODES.map((m) => getMapStyle(m) as string);
    for (const m of MAP_STYLE_MODES) {
      expect(getMapStyle(m)).toBe(`https://api.maptiler.com/maps/${expected[m]}/style.json?key=${KEY}`);
    }
    expect(new Set(urls).size).toBe(MAP_STYLE_MODES.length);
  });

  it('une surcharge VITE_MAP_STYLE_ID_<MODE> est appliquée et reconnue', () => {
    setEnv({ VITE_MAP_PROVIDER: 'maptiler', VITE_MAP_API_KEY: KEY, VITE_MAP_STYLE_ID_DARK: 'dataviz-v4-dark' });
    expect(getMapStyle('dark')).toContain('/maps/dataviz-v4-dark/style.json');
    expect(isDefaultProvider('dark')).toBe(false);
    expect(isDefaultProvider('plan')).toBe(true);
  });

  it('Esri : « Hybride » sans identifiant explicite est refusé (jamais présenté comme de l’imagerie seule)', () => {
    setEnv({ VITE_MAP_PROVIDER: 'esri', VITE_MAP_API_KEY: KEY });
    expect(() => getMapStyle('hybrid')).toThrowError(/VITE_MAP_STYLE_ID_HYBRID/);
    expect(getMapStyle('satellite')).toContain('ArcGIS:Imagery');
    setEnv({ VITE_MAP_PROVIDER: 'esri', VITE_MAP_API_KEY: KEY, VITE_MAP_STYLE_ID_HYBRID: 'ArcGIS:ImageryStandard' });
    expect(getMapStyle('hybrid')).toContain('ArcGIS:ImageryStandard');
  });

  it('Mapbox : endpoint HTTPS (MapLibre ne résout pas mapbox://) et hybride ≠ satellite', () => {
    setEnv({ VITE_MAP_PROVIDER: 'mapbox', VITE_MAP_API_KEY: KEY });
    expect(getMapStyle('satellite')).toMatch(/^https:\/\/api\.mapbox\.com\/styles\/v1\/mapbox\/satellite-v9\?access_token=/);
    expect(getMapStyle('hybrid')).not.toBe(getMapStyle('satellite'));
  });

  it('custom : URL de style requise, générale ou par mode', () => {
    setEnv({ VITE_MAP_PROVIDER: 'custom' });
    expect(() => getMapStyle('plan')).toThrowError(/VITE_MAP_STYLE_URL/);
    setEnv({ VITE_MAP_PROVIDER: 'custom', VITE_MAP_STYLE_URL: 'https://x.example/style.json', VITE_MAP_STYLE_URL_DARK: 'https://x.example/dark.json' });
    expect(getMapStyle('plan')).toBe('https://x.example/style.json');
    expect(getMapStyle('dark')).toBe('https://x.example/dark.json');
  });

  it('style de secours : vraie carte OSM raster, identique pour tous les modes, sans clé', () => {
    setEnv({});
    for (const m of MAP_STYLE_MODES) {
      const s = getMapStyle(m, true);
      expect(typeof s).toBe('object');
      const spec = s as { sources: Record<string, { type: string; tiles: string[]; attribution: string; maxzoom: number }> };
      expect(spec.sources.base.type).toBe('raster');
      expect(spec.sources.base.tiles).toEqual(['https://tile.openstreetmap.org/{z}/{x}/{y}.png']);
      expect(spec.sources.base.attribution).toContain('OpenStreetMap');
      expect(spec.sources.base.maxzoom).toBe(19);
    }
    expect(BASE_SOURCE_IDS).toContain('base');
  });
});

describe('map-config — zoom autorisé par le code (≠ détail réel des images)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('défauts : imagerie 19, vecteur 20', () => {
    setEnv({});
    expect(getMapViewOptions('satellite').maxZoom).toBe(19);
    expect(getMapViewOptions('hybrid').maxZoom).toBe(19);
    expect(getMapViewOptions('plan').maxZoom).toBe(20);
    expect(getMapViewOptions('dark').maxZoom).toBe(20);
  });

  it('plafond imagerie mesuré sur le terrain : appliqué au satellite et à l’hybride uniquement', () => {
    setEnv({ VITE_MAP_MAXZOOM_SATELLITE: '17' });
    expect(getMapViewOptions('satellite').maxZoom).toBe(17);
    expect(getMapViewOptions('hybrid').maxZoom).toBe(17);
    expect(getMapViewOptions('plan').maxZoom).toBe(20);
  });

  it('valeurs absurdes ignorées (non numérique, < 5, > 22)', () => {
    for (const bad of ['abc', '3', '30']) {
      setEnv({ VITE_MAP_MAXZOOM_SATELLITE: bad });
      expect(getMapViewOptions('satellite').maxZoom).toBe(19);
    }
  });
});
