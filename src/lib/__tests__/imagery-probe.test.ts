import { describe, expect, it } from 'vitest';
import { assessDetailGain, childTiles, lngLatToTile } from '../imagery-probe';

describe('imagery-probe', () => {
  it('calcule les indices de tuile XYZ (valeurs de référence OSM : Greenwich z0 et z1)', () => {
    expect(lngLatToTile(0, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(lngLatToTile(-0.0001, 0.0001, 1)).toEqual({ x: 0, y: 0 });
    expect(lngLatToTile(0.0001, -0.0001, 1)).toEqual({ x: 1, y: 1 });
  });
  it('refuse des coordonnées hors Web Mercator', () => {
    expect(() => lngLatToTile(10, 89, 5)).toThrow(RangeError);
    expect(() => lngLatToTile(Number.NaN, 0, 5)).toThrow(RangeError);
  });
  it('les 4 enfants d’une tuile sont au zoom suivant et couvrent (2x..2x+1, 2y..2y+1)', () => {
    expect(childTiles(3, 5, 6)).toEqual([
      { z: 4, x: 10, y: 12 }, { z: 4, x: 11, y: 12 }, { z: 4, x: 10, y: 13 }, { z: 4, x: 11, y: 13 },
    ]);
  });
  it('verdict : détail natif / agrandissement / indéterminé / entrées invalides', () => {
    expect(assessDetailGain(20_000, [20_000, 21_000, 19_000, 20_000]).verdict).toBe('native');
    expect(assessDetailGain(20_000, [11_000, 12_000, 10_000, 11_000]).verdict).toBe('upscaled');
    expect(assessDetailGain(20_000, [15_000, 14_000, 15_000, 14_000]).verdict).toBe('undetermined');
    expect(() => assessDetailGain(0, [1, 1, 1, 1])).toThrow(RangeError);
    expect(() => assessDetailGain(1, [1, 1, 1])).toThrow(RangeError);
  });
});
