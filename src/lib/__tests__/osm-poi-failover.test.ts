import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchExternalPOIs, resetPoiCaches } from '../osm-poi';

// Données et URL FICTIVES de test.
const A = 'https://a.overpass.test/api/interpreter';
const B = 'https://b.overpass.test/api/interpreter';
const bbox = { west: 15.3, south: -4.33, east: 15.31, north: -4.32 };
const farBbox = { west: 15.34, south: -4.37, east: 15.35, north: -4.36 };
const poi = (name: string) => ({ type: 'node', id: 7, lat: -4.325, lon: 15.305, tags: { name, amenity: 'pharmacy' } });
const body = (o: { elements?: unknown[]; remark?: string; ts?: string } = {}) =>
  JSON.stringify({
    version: 0.6,
    osm3s: { timestamp_osm_base: o.ts ?? new Date().toISOString() },
    elements: o.elements ?? [],
    ...(o.remark ? { remark: o.remark } : {}),
  });
const res = (b: string, status = 200) => new Response(b, { status });
const urlOf = (call: unknown[]) => String(call[0]);

/** fetch scripté par URL : chaque URL a une file de réponses (ou fonctions). */
function scriptedFetch(script: Record<string, Array<() => Promise<Response> | Response>>) {
  const queues = Object.fromEntries(Object.entries(script).map(([k, v]) => [k, [...v]]));
  return vi.fn(async (url: unknown) => {
    const q = queues[String(url)];
    const next = q?.length > 1 ? q.shift() : q?.[0];
    if (!next) throw new TypeError('Failed to fetch (aucune réponse scriptée)');
    return next();
  });
}

describe('Overpass — secours multi-serveurs', () => {
  beforeEach(() => resetPoiCaches());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('502 sur le principal → le serveur de secours répond, résultat réel', async () => {
    const f = scriptedFetch({ [A]: [() => res('Bad Gateway', 502)], [B]: [() => res(body({ elements: [poi('Pharmacie B')] }))] });
    vi.stubGlobal('fetch', f);
    const pois = await fetchExternalPOIs(bbox, undefined, { endpoints: [A, B] });
    expect(pois.map((p) => p.name)).toEqual(['Pharmacie B']);
    expect(f.mock.calls.map(urlOf)).toEqual([A, B]);
  });

  it('HTTP 200 avec « runtime error » dans remark = panne, JAMAIS « aucun lieu »', async () => {
    const f = scriptedFetch({
      [A]: [() => res(body({ remark: 'runtime error: Query timed out in "query" at line 3 after 11 seconds.' }))],
      [B]: [() => res(body({ elements: [poi('Pharmacie B')] }))],
    });
    vi.stubGlobal('fetch', f);
    const pois = await fetchExternalPOIs(bbox, undefined, { endpoints: [A, B] });
    expect(pois).toHaveLength(1);
  });

  it('remark d’erreur sur l’unique serveur : erreur explicite, pas de liste vide mise en cache', async () => {
    const f = scriptedFetch({ [A]: [() => res(body({ remark: 'runtime error: Query run out of memory using 536870912 bytes.' }))] });
    vi.stubGlobal('fetch', f);
    await expect(fetchExternalPOIs(bbox, undefined, { endpoints: [A] })).rejects.toMatchObject({ kind: 'server_error' });
    // Un nouvel essai forcé interroge bien le réseau (rien n'a été mis en cache comme « vide »).
    f.mockClear();
    await expect(fetchExternalPOIs(bbox, undefined, { endpoints: [A], force: true })).rejects.toBeDefined();
    expect(f).toHaveBeenCalled();
  });

  it('page HTML en HTTP 200 (serveur défaillant) → bascule sur le secours', async () => {
    const f = scriptedFetch({ [A]: [() => res('<html>maintenance</html>')], [B]: [() => res(body({ elements: [poi('Pharmacie B')] }))] });
    vi.stubGlobal('fetch', f);
    expect(await fetchExternalPOIs(bbox, undefined, { endpoints: [A, B] })).toHaveLength(1);
  });

  it('403 (IP bloquée) sur le principal → secours', async () => {
    const f = scriptedFetch({ [A]: [() => res('Forbidden', 403)], [B]: [() => res(body({ elements: [poi('Pharmacie B')] }))] });
    vi.stubGlobal('fetch', f);
    expect(await fetchExternalPOIs(bbox, undefined, { endpoints: [A, B] })).toHaveLength(1);
  });

  it('429 : on passe au serveur suivant sans réinsister, puis le serveur limité est évité à l’appel suivant', async () => {
    const f = scriptedFetch({
      [A]: [() => res('Too Many Requests', 429)],
      [B]: [() => res(body({ elements: [poi('Pharmacie B')] }))],
    });
    vi.stubGlobal('fetch', f);
    await fetchExternalPOIs(bbox, undefined, { endpoints: [A, B] });
    expect(f.mock.calls.map(urlOf)).toEqual([A, B]);
    f.mockClear();
    await fetchExternalPOIs(farBbox, undefined, { endpoints: [A, B] });
    expect(f.mock.calls.map(urlOf)).toEqual([B]); // A est mis au repos : pas de nouveau coup sur un service qui limite
  });

  it('429 sur l’unique serveur : une seule requête, pas de martelage', async () => {
    const f = scriptedFetch({ [A]: [() => res('Too Many Requests', 429)] });
    vi.stubGlobal('fetch', f);
    await expect(fetchExternalPOIs(bbox, undefined, { endpoints: [A] })).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('délai dépassé sur le principal → secours (un seul délai d’attente à payer)', async () => {
    vi.useFakeTimers();
    const f = vi.fn((url: unknown, init?: RequestInit) => {
      if (String(url) === A) {
        return new Promise<Response>((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
      }
      return Promise.resolve(res(body({ elements: [poi('Pharmacie B')] })));
    });
    vi.stubGlobal('fetch', f);
    const p = fetchExternalPOIs(bbox, undefined, { endpoints: [A, B] });
    await vi.advanceTimersByTimeAsync(13_000);
    expect(await p).toHaveLength(1);
    expect(f.mock.calls.map(urlOf)).toEqual([A, B]);
  });

  it('données périmées sur le principal : on préfère un secours à jour', async () => {
    const old = new Date(Date.now() - 100 * 86_400_000).toISOString();
    const f = scriptedFetch({
      [A]: [() => res(body({ ts: old, elements: [poi('Ancienne pharmacie')] }))],
      [B]: [() => res(body({ elements: [poi('Pharmacie à jour')] }))],
    });
    vi.stubGlobal('fetch', f);
    const pois = await fetchExternalPOIs(bbox, undefined, { endpoints: [A, B] });
    expect(pois.map((p) => p.name)).toEqual(['Pharmacie à jour']);
  });

  it('données périmées partout : dernier recours = données réelles anciennes, pas une panne', async () => {
    const old = new Date(Date.now() - 100 * 86_400_000).toISOString();
    const f = scriptedFetch({
      [A]: [() => res(body({ ts: old, elements: [poi('Ancienne pharmacie')] }))],
      [B]: [() => res('Bad Gateway', 502)],
    });
    vi.stubGlobal('fetch', f);
    const pois = await fetchExternalPOIs(bbox, undefined, { endpoints: [A, B] });
    expect(pois.map((p) => p.name)).toEqual(['Ancienne pharmacie']);
  });

  it('400 (requête invalide) : aucune bascule, l’erreur n’est pas une panne de serveur', async () => {
    const f = scriptedFetch({ [A]: [() => res('Bad Request', 400)], [B]: [() => res(body())] });
    vi.stubGlobal('fetch', f);
    await expect(fetchExternalPOIs(bbox, undefined, { endpoints: [A, B] })).rejects.toMatchObject({ kind: 'bad_request' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('un seul serveur en 502 : une seule nouvelle tentative après délai', async () => {
    vi.useFakeTimers();
    const f = scriptedFetch({ [A]: [() => res('Bad Gateway', 502), () => res(body({ elements: [poi('Pharmacie A')] }))] });
    vi.stubGlobal('fetch', f);
    const p = fetchExternalPOIs(bbox, undefined, { endpoints: [A] });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await p).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('tous les serveurs en échec : message explicite avec le nombre de serveurs essayés', async () => {
    const f = scriptedFetch({ [A]: [() => res('Bad Gateway', 502)], [B]: [() => res('Service Unavailable', 503)] });
    vi.stubGlobal('fetch', f);
    const err = await fetchExternalPOIs(bbox, undefined, { endpoints: [A, B] }).catch((e: Error) => e);
    expect(err).toMatchObject({ kind: 'server_error' });
    expect((err as Error).message).toMatch(/2 serveurs/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('« Réessayer » (force) interroge de nouveau même un serveur mis au repos', async () => {
    const f = scriptedFetch({ [A]: [() => res('Too Many Requests', 429), () => res(body({ elements: [poi('Pharmacie A')] }))] });
    vi.stubGlobal('fetch', f);
    await expect(fetchExternalPOIs(bbox, undefined, { endpoints: [A] })).rejects.toBeDefined();
    const pois = await fetchExternalPOIs(bbox, undefined, { endpoints: [A], force: true });
    expect(pois).toHaveLength(1);
  });
});
