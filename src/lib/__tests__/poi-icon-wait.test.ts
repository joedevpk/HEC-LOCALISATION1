import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Map as MLMap } from 'maplibre-gl';
import { waitForStyleReady } from '../poi-icon-sprites';

/** Faux « map » minimal : un émetteur d'événements et un isStyleLoaded pilotable. */
function fakeMap(loaded: boolean, styleDoc = false) {
  const handlers = new Map<string, Set<() => void>>();
  const state = { loaded };
  const map = {
    isStyleLoaded: () => state.loaded,
    getStyle: () => (styleDoc ? { version: 8 } : undefined),
    on: (e: string, fn: () => void) => { (handlers.get(e) ?? handlers.set(e, new Set()).get(e)!).add(fn); },
    off: (e: string, fn: () => void) => { handlers.get(e)?.delete(fn); },
  };
  const emit = (e: string) => [...(handlers.get(e) ?? [])].forEach((fn) => fn());
  const listeners = () => [...handlers.values()].reduce((n, s) => n + s.size, 0);
  return { map: map as unknown as MLMap, state, emit, listeners };
}

describe('waitForStyleReady — ne doit jamais attendre indéfiniment', () => {
  afterEach(() => vi.useRealTimers());

  it('résout tout de suite si le style est déjà chargé', async () => {
    await expect(waitForStyleReady(fakeMap(true).map)).resolves.toBeUndefined();
  });

  it('document de style chargé alors que des tuiles échouent (isStyleLoaded faux) : résolution immédiate', async () => {
    await expect(waitForStyleReady(fakeMap(false, true).map)).resolves.toBeUndefined();
  });

  it('REPRODUCTION DU BUG : « style.load » avec isStyleLoaded() encore faux suffit à résoudre', async () => {
    const f = fakeMap(false);
    let resolved = false;
    void waitForStyleReady(f.map).then(() => { resolved = true; });
    f.emit('style.load'); // isStyleLoaded() reste faux, comme observé en navigateur après setStyle
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('« idle » résout aussi ; styledata ne résout que si le style est réellement chargé', async () => {
    const f = fakeMap(false);
    let resolved = false;
    void waitForStyleReady(f.map).then(() => { resolved = true; });
    f.emit('styledata'); await Promise.resolve();
    expect(resolved).toBe(false);
    f.state.loaded = true; f.emit('styledata'); await Promise.resolve();
    expect(resolved).toBe(true);
    const g = fakeMap(false); let r2 = false;
    void waitForStyleReady(g.map).then(() => { r2 = true; });
    g.emit('idle'); await Promise.resolve();
    expect(r2).toBe(true);
  });

  it('délai de dernier recours : jamais d’attente infinie', async () => {
    vi.useFakeTimers();
    const f = fakeMap(false);
    let resolved = false;
    void waitForStyleReady(f.map, 3000).then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(2999);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(resolved).toBe(true);
  });

  it('retire tous ses écouteurs une fois résolu (pas de fuite)', async () => {
    const f = fakeMap(false);
    void waitForStyleReady(f.map);
    expect(f.listeners()).toBe(4);
    f.emit('style.load'); await Promise.resolve();
    expect(f.listeners()).toBe(0);
  });
});
