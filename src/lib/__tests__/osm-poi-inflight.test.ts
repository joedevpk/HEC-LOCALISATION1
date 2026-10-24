import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchExternalPOIs, resetPoiCaches } from '../osm-poi';

const bbox = { west: 15.30, south: -4.33, east: 15.31, north: -4.32 };
const okBody = {
  elements: [{ type: 'node', id: 7, lat: -4.325, lon: 15.305, tags: { name: 'Pharmacie Test', amenity: 'pharmacy' } }],
};

/** fetch qui reste en attente jusqu'à abort() ou jusqu'à resolve(). */
function pendingFetch() {
  let resolve!: (r: Response) => void;
  const fn = vi.fn((_url: unknown, init?: RequestInit) => {
    return new Promise<Response>((res, rej) => {
      resolve = res;
      init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    });
  });
  return { fn, resolve: (r: Response) => resolve(r) };
}

describe('fetchExternalPOIs — requêtes partagées et annulation', () => {
  beforeEach(() => resetPoiCaches());
  afterEach(() => vi.unstubAllGlobals());

  it("une requête plus récente sur la même zone n'hérite pas de l'annulation de la précédente", async () => {
    const first = pendingFetch();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(first.fn)
      .mockResolvedValue(new Response(JSON.stringify(okBody), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    // L'utilisateur déplace la carte : la requête 1 est annulée, la requête 2
    // vise la même zone (même clé de cache) pendant que la 1 est encore en vol.
    const c1 = new AbortController();
    const p1 = fetchExternalPOIs(bbox, c1.signal);
    p1.catch(() => {});
    c1.abort();
    const c2 = new AbortController();
    const pois = await fetchExternalPOIs(bbox, c2.signal);

    expect(pois).toHaveLength(1);
    expect(pois[0].name).toBe('Pharmacie Test');
  });

  it('deux appels simultanés non annulés partagent une seule requête réseau', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(okBody), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([fetchExternalPOIs(bbox), fetchExternalPOIs(bbox)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("l'appelant annulé reçoit bien une erreur d'annulation, pas un résultat", async () => {
    const pf = pendingFetch();
    vi.stubGlobal('fetch', pf.fn);
    const c = new AbortController();
    const p = fetchExternalPOIs(bbox, c.signal);
    c.abort();
    await expect(p).rejects.toMatchObject({ kind: 'abort' });
  });
});
