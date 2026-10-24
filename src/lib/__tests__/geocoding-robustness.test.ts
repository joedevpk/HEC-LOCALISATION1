import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGeocodeCache, searchPlaces } from '../geocoding';

const nom = { provider: 'nominatim' as const, autocomplete: false };
const mt = { provider: 'maptiler' as const, autocomplete: true, apiKey: 'TEST_KEY' };
// Données FICTIVES de test (aucune ne représente un lieu réel).
const nomBody = [{ lat: '-4.3', lon: '15.3', display_name: 'Lieu Test, Ville', name: 'Lieu Test', osm_type: 'node', osm_id: 1 }];
const mtBody = (n: number) => ({
  features: [{ id: `poi.${n}`, text: `Lieu ${n}`, place_name: `Lieu ${n}, Ville`, center: [15.3, -4.3] }],
});
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

describe('Nominatim — limite d’1 requête par seconde', () => {
  beforeEach(() => {
    resetGeocodeCache();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('deux recherches simultanées ne partent jamais ensemble', async () => {
    const times: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        times.push(Date.now());
        return ok(nomBody);
      }),
    );
    const p = Promise.all([
      searchPlaces('alpha rue', { config: nom }),
      searchPlaces('beta rue', { config: nom }),
      searchPlaces('gamma rue', { config: nom }),
    ]);
    await vi.advanceTimersByTimeAsync(5_000);
    await p;
    expect(times).toHaveLength(3);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1_000);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(1_000);
  });

  it('une recherche annulée pendant l’attente n’envoie aucune requête', async () => {
    const fetchMock = vi.fn(async () => ok(nomBody));
    vi.stubGlobal('fetch', fetchMock);
    const first = searchPlaces('premier lieu', { config: nom });
    const c = new AbortController();
    const second = searchPlaces('second lieu', { config: nom, signal: c.signal });
    const secondResult = second.then(
      () => 'ok',
      (e: { kind?: string }) => e.kind,
    );
    c.abort();
    await vi.advanceTimersByTimeAsync(5_000);
    await first;
    expect(await secondResult).toBe('abort');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('MapTiler — corps de réponse, cache, proximité', () => {
  beforeEach(() => resetGeocodeCache());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('un corps de réponse qui n’arrive jamais finit en « délai dépassé », pas en attente infinie', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: unknown, init?: RequestInit) => {
        const body = new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
          },
        });
        return new Response(body, { status: 200 });
      }),
    );
    const p = searchPlaces('boulevard test', { config: mt }).then(
      () => 'ok',
      (e: { kind?: string }) => e.kind,
    );
    await vi.advanceTimersByTimeAsync(9_000);
    expect(await p).toBe('timeout');
  });

  it('une annulation pendant la lecture du corps est signalée comme annulation', async () => {
    const c = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: unknown, init?: RequestInit) => {
        const body = new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
          },
        });
        return new Response(body, { status: 200 });
      }),
    );
    const p = searchPlaces('avenue test', { config: mt, signal: c.signal }).then(
      () => 'ok',
      (e: { kind?: string }) => e.kind,
    );
    await Promise.resolve();
    c.abort();
    expect(await p).toBe('abort');
  });

  it('le cache reste borné et un résultat expiré/évincé est redemandé', async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => ok(mtBody(++n)));
    vi.stubGlobal('fetch', fetchMock);
    for (let i = 0; i < 130; i++) await searchPlaces(`requete numero ${i}`, { config: mt });
    expect(fetchMock).toHaveBeenCalledTimes(130);
    await searchPlaces('requete numero 129', { config: mt }); // récent : en cache
    expect(fetchMock).toHaveBeenCalledTimes(130);
    await searchPlaces('requete numero 0', { config: mt }); // évincé : nouvelle requête
    expect(fetchMock).toHaveBeenCalledTimes(131);
  });

  it('une proximité invalide n’est jamais envoyée au fournisseur', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => ok(mtBody(1)));
    vi.stubGlobal('fetch', fetchMock);
    await searchPlaces('place centrale', { config: mt, proximity: [Number.NaN, 400] });
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('proximity');
    await searchPlaces('place centrale bis', { config: mt, proximity: [15.3, -4.3] });
    expect(String(fetchMock.mock.calls[1][0])).toContain('proximity=15.300%2C-4.300');
  });
});
