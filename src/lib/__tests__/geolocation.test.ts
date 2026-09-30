import { describe, expect, it } from 'vitest';
import {
  classifyAccuracy,
  isBetterFix,
  isPreciseEnoughForRouting,
  isTrustworthy,
  toGeoFix,
  type GeoFix,
} from '@/lib/geolocation';

const T0 = 1_700_000_000_000;
function fix(over: Partial<GeoFix> = {}): GeoFix {
  const accuracy = over.accuracy ?? 10;
  return {
    lat: -4.3,
    lng: 15.3,
    accuracy,
    heading: null,
    speed: null,
    timestamp: T0,
    tier: classifyAccuracy(accuracy),
    ...over,
  };
}

describe('classifyAccuracy', () => {
  it('classe selon les seuils 100 m / 1000 m', () => {
    expect(classifyAccuracy(5)).toBe('precise');
    expect(classifyAccuracy(100)).toBe('precise');
    expect(classifyAccuracy(101)).toBe('approximate');
    expect(classifyAccuracy(1000)).toBe('approximate');
    expect(classifyAccuracy(1001)).toBe('unreliable');
  });
});

describe('isBetterFix', () => {
  it('accepte toujours la première lecture', () => {
    expect(isBetterFix(fix(), null)).toBe(true);
  });
  it("suit l'utilisateur qui marche : un fix plus récent de même palier remplace le précédent, même un peu moins précis", () => {
    const current = fix({ accuracy: 5, timestamp: T0 });
    const next = fix({ accuracy: 12, timestamp: T0 + 2_000 });
    expect(isBetterFix(next, current)).toBe(true);
  });
  it('rejette une lecture plus ancienne', () => {
    expect(isBetterFix(fix({ timestamp: T0 - 1 }), fix())).toBe(false);
  });
  it("ne remplace pas une position précise et fraîche par une lecture dégradée soudaine (cas 'RDC affiché en Belgique')", () => {
    const current = fix({ accuracy: 8, timestamp: T0 });
    const degraded = fix({ accuracy: 3000, timestamp: T0 + 1_000 });
    expect(isBetterFix(degraded, current)).toBe(false);
  });
  it('accepte une lecture dégradée si la position précise est devenue périmée', () => {
    const current = fix({ accuracy: 8, timestamp: T0 });
    const degraded = fix({ accuracy: 3000, timestamp: T0 + 25_000 });
    expect(isBetterFix(degraded, current)).toBe(true);
  });
  it('un meilleur palier remplace toujours', () => {
    const current = fix({ accuracy: 500, timestamp: T0 });
    const better = fix({ accuracy: 20, timestamp: T0 + 500 });
    expect(isBetterFix(better, current)).toBe(true);
  });
  it('à horodatage identique, seule une meilleure précision remplace', () => {
    expect(isBetterFix(fix({ accuracy: 4 }), fix({ accuracy: 9 }))).toBe(true);
    expect(isBetterFix(fix({ accuracy: 9 }), fix({ accuracy: 4 }))).toBe(false);
  });
});

describe('isTrustworthy / isPreciseEnoughForRouting', () => {
  it('rejette une lecture imprécise ou périmée', () => {
    expect(isTrustworthy(fix({ accuracy: 2000 }), T0)).toBe(false);
    expect(isTrustworthy(fix({ accuracy: 10 }), T0 + 60_000)).toBe(false);
    expect(isTrustworthy(fix({ accuracy: 10 }), T0 + 5_000)).toBe(true);
  });
  it('itinéraire précis uniquement si ≤ 100 m et récent', () => {
    expect(isPreciseEnoughForRouting(fix({ accuracy: 50, timestamp: Date.now() }))).toBe(true);
    expect(isPreciseEnoughForRouting(fix({ accuracy: 300, timestamp: Date.now() }))).toBe(false);
  });
});

describe('toGeoFix', () => {
  const pos = (coords: Partial<GeolocationCoordinates>): GeolocationPosition =>
    ({
      coords: { latitude: -4.3, longitude: 15.3, accuracy: 12, heading: null, speed: null, ...coords },
      timestamp: T0,
    }) as unknown as GeolocationPosition;

  it('ne fabrique jamais heading / speed', () => {
    const f = toGeoFix(pos({}));
    expect(f?.heading).toBeNull();
    expect(f?.speed).toBeNull();
  });
  it('transmet heading / speed réels quand le capteur les fournit', () => {
    const f = toGeoFix(pos({ heading: 90, speed: 1.4 }));
    expect(f?.heading).toBe(90);
    expect(f?.speed).toBe(1.4);
  });
  it('rejette NaN, hors bornes et précision invalide', () => {
    const silence = console.error;
    console.error = () => undefined;
    try {
      expect(toGeoFix(pos({ latitude: Number.NaN }))).toBeNull();
      expect(toGeoFix(pos({ longitude: 999 }))).toBeNull();
      expect(toGeoFix(pos({ accuracy: -1 }))).toBeNull();
    } finally {
      console.error = silence;
    }
  });
});
