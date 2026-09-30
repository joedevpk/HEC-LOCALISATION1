import { beforeEach, describe, expect, it } from 'vitest';
import { defaultPrivacyPrefs, readPrivacyPrefs, writePrivacyPrefs } from '@/lib/privacy-prefs';

// Environnement de test « node » : on fournit un localStorage minimal.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

describe('privacy-prefs', () => {
  beforeEach(() => store.clear());

  it("l'historique de recherche est activé par défaut (comportement historique)", () => {
    expect(readPrivacyPrefs()).toEqual(defaultPrivacyPrefs);
    expect(readPrivacyPrefs().saveSearchHistory).toBe(true);
  });

  it('mémorise le refus et le relit', () => {
    writePrivacyPrefs({ saveSearchHistory: false });
    expect(readPrivacyPrefs().saveSearchHistory).toBe(false);
  });

  it('ignore un contenu corrompu ou de mauvais type', () => {
    store.set('hec-privacy-prefs', '{oups');
    expect(readPrivacyPrefs()).toEqual(defaultPrivacyPrefs);
    store.set('hec-privacy-prefs', JSON.stringify({ saveSearchHistory: 'non' }));
    expect(readPrivacyPrefs().saveSearchHistory).toBe(true);
  });
});
