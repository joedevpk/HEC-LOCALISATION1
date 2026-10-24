import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OverpassError,
  buildOverpassQuery,
  clampBbox,
  fetchExternalPOIs,
  parseOverpassUrls,
  resetPoiCaches,
} from '../osm-poi';

const bbox = { west: 15.30, south: -4.33, east: 15.31, north: -4.32 };
const okBody = {
  elements: [{ type: 'node', id: 1, lat: -4.325, lon: 15.305, tags: { name: 'Pharmacie Test', amenity: 'pharmacy' } }],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('clampBbox / buildOverpassQuery / parseOverpassUrls', () => {
  it('réduit une zone trop vaste autour de son centre, sans toucher une petite zone', () => {
    expect(clampBbox(bbox)).toEqual(bbox);
    const big = clampBbox({ west: 14, south: -5, east: 16, north: -3 }, 0.03);
    expect(big.east - big.west).toBeCloseTo(0.03, 6);
    expect((big.west + big.east) / 2).toBeCloseTo(15, 6);
    expect((big.north + big.south) / 2).toBeCloseTo(-4, 6);
  });

  it('construit une requête allégée : nw, noms exigés, délai serveur < délai client', () => {
    const q = buildOverpassQuery(bbox);
    expect(q).toContain('[timeout:10]');
    expect(q).toContain('nw["amenity"');
    expect(q).toContain('["name"]');
    expect(q).not.toMatch(/\brelation\b/);
  });

  it('accepte plusieurs miroirs séparés par des virgules et ignore les valeurs invalides', () => {
    expect(parseOverpassUrls('https://a.example/api, https://b.example/api ,pas-une-url')).toEqual([
      'https://a.example/api',
      'https://b.example/api',
    ]);
    // MODIFIÉ (audit 2) : le défaut est désormais [principal, secours] ; une seule URL dans
    // VITE_OVERPASS_URL désactive le secours.
    expect(parseOverpassUrls(undefined)).toEqual([
      'https://overpass-api.de/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
    ]);
    expect(parseOverpassUrls('https://seul.example/api')).toEqual(['https://seul.example/api']);
  });
});

describe('fetchExternalPOIs', () => {
  beforeEach(() => resetPoiCaches());
  afterEach(() => vi.unstubAllGlobals());

  it('réessaie après un 503 puis renvoie les vrais résultats', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json(okBody));
    vi.stubGlobal('fetch', fetchMock);
    const pois = await fetchExternalPOIs(bbox);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pois).toHaveLength(1);
    expect(pois[0].name).toBe('Pharmacie Test');
  });

  it('mémorise un échec : pas de nouvelle requête automatique, mais « Réessayer » (force) passe', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}, 503));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchExternalPOIs(bbox)).rejects.toBeInstanceOf(OverpassError);
    const callsAfterFailure = fetchMock.mock.calls.length; // 1 + MAX_RETRIES tentatives
    await expect(fetchExternalPOIs(bbox)).rejects.toBeInstanceOf(OverpassError);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFailure); // cooldown : aucun appel réseau

    fetchMock.mockResolvedValue(json(okBody));
    const pois = await fetchExternalPOIs(bbox, undefined, { force: true });
    expect(pois).toHaveLength(1);
  }, 15_000);

  it('met en cache un succès (second appel sans réseau)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(okBody));
    vi.stubGlobal('fetch', fetchMock);
    await fetchExternalPOIs(bbox);
    await fetchExternalPOIs(bbox);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ne fabrique aucun résultat : une réponse invalide est une erreur', async () => {
    // MODIFIÉ (audit 2) : une réponse NEUVE par appel, comme un vrai fetch. Avec le secours
    // multi-serveurs, la même Response (corps déjà lu) serait relue par le second serveur.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json({ pas: 'elements' })));
    await expect(fetchExternalPOIs(bbox)).rejects.toMatchObject({ kind: 'invalid_response' });
  });
});
