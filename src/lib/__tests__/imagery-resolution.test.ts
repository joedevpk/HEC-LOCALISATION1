import { afterEach, describe, expect, it, vi } from 'vitest';
import { metersPerCssPixel, nativeDetailZoom, stretchFactor, usefulMaxZoom } from '../imagery-resolution';
import { getMapViewOptions } from '../map-config';

describe('imagery-resolution', () => {
  it('résolution de référence : ≈ 0,2986 m par pixel CSS au zoom 18 à l’équateur (monde de 512 px au zoom 0)', () => {
    expect(metersPerCssPixel(18, 0)).toBeCloseTo(0.2986, 3);
    expect(metersPerCssPixel(17, 0)).toBeCloseTo(0.5972, 3);
    expect(metersPerCssPixel(0, 0)).toBeCloseTo(78_271.517, 2);
  });
  it('la résolution est divisée par 2 à chaque niveau de zoom et réduite par cos(latitude)', () => {
    expect(metersPerCssPixel(17, 0) / metersPerCssPixel(18, 0)).toBeCloseTo(2, 10);
    expect(metersPerCssPixel(18, 60) / metersPerCssPixel(18, 0)).toBeCloseTo(0.5, 6);
  });
  it('étirement à Kinshasa (≈ -4,3°) : 1 m/px natif → ×3,4 au zoom 18 ; 2 m/px → ×6,7', () => {
    expect(stretchFactor(18, 1, -4.32)).toBeCloseTo(3.36, 1);
    expect(stretchFactor(18, 2, -4.32)).toBeCloseTo(6.71, 1);
    expect(stretchFactor(16, 1, -4.32)).toBeLessThan(1); // au zoom 16, 1 m/px est encore net
  });
  it('zoom natif : ≈ 16,25 pour 1 m/px et ≈ 15,25 pour 2 m/px', () => {
    expect(nativeDetailZoom(1, -4.32)).toBeCloseTo(16.25, 1);
    expect(nativeDetailZoom(2, -4.32)).toBeCloseTo(15.25, 1);
  });
  it('plafond utile : natif + 1 niveau, borné ; entrées invalides refusées', () => {
    expect(usefulMaxZoom(1, 19)).toBe(17);
    expect(usefulMaxZoom(2, 19)).toBe(16);
    expect(usefulMaxZoom(0.1, 19)).toBe(19); // 10 cm/px : plafonné par le code
    expect(() => usefulMaxZoom(0, 19)).toThrow(RangeError);
    expect(() => metersPerCssPixel(Number.NaN)).toThrow(RangeError);
  });
});

describe('plafond de zoom satellite dérivé de la résolution native (optionnel)', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('sans configuration : 19, aucune hypothèse sur l’imagerie', () => {
    vi.stubEnv('VITE_MAP_IMAGERY_NATIVE_MPP', '');
    vi.stubEnv('VITE_MAP_MAXZOOM_SATELLITE', '');
    expect(getMapViewOptions('satellite').maxZoom).toBe(19);
  });
  it('avec 2 m/px : satellite et hybride plafonnés à 16, plan inchangé', () => {
    vi.stubEnv('VITE_MAP_MAXZOOM_SATELLITE', '');
    vi.stubEnv('VITE_MAP_IMAGERY_NATIVE_MPP', '2');
    expect(getMapViewOptions('satellite').maxZoom).toBe(16);
    expect(getMapViewOptions('hybrid').maxZoom).toBe(16);
    expect(getMapViewOptions('plan').maxZoom).toBe(20);
  });
  it('un plafond explicite l’emporte toujours', () => {
    vi.stubEnv('VITE_MAP_IMAGERY_NATIVE_MPP', '2');
    vi.stubEnv('VITE_MAP_MAXZOOM_SATELLITE', '18');
    expect(getMapViewOptions('satellite').maxZoom).toBe(18);
  });
  it('valeur non numérique ou négative ignorée', () => {
    vi.stubEnv('VITE_MAP_MAXZOOM_SATELLITE', '');
    for (const bad of ['abc', '-1', '0']) {
      vi.stubEnv('VITE_MAP_IMAGERY_NATIVE_MPP', bad);
      expect(getMapViewOptions('satellite').maxZoom).toBe(19);
    }
  });
});
