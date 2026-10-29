import { describe, expect, it } from 'vitest';
import { maptilerPrecision, nominatimPrecision, parseMapTiler, parseNominatim } from '../geocoding';

describe('précision des résultats de recherche', () => {
  it('MapTiler : adresse/POI précis ; quartier, commune, rue… approximatifs ; absent = non déterminé', () => {
    expect(maptilerPrecision(['address'])).toBe('precise');
    expect(maptilerPrecision(['poi'])).toBe('precise');
    expect(maptilerPrecision(['neighbourhood'])).toBe('approximate');
    expect(maptilerPrecision(['municipality'])).toBe('approximate');
    expect(maptilerPrecision(undefined)).toBeUndefined();
    expect(maptilerPrecision([])).toBeUndefined();
  });
  it('Nominatim : bâtiment/établissement précis ; zone administrative approximative', () => {
    expect(nominatimPrecision('amenity', 'amenity')).toBe('precise');
    expect(nominatimPrecision('boundary', 'suburb')).toBe('approximate');
    expect(nominatimPrecision(undefined, undefined)).toBeUndefined();
  });
  it('les résultats sans coordonnées valides sont écartés (jamais d’adresse « géocodée » sans position)', () => {
    const r = parseMapTiler({
      features: [
        { id: 'a', text: 'Bon', place_name: 'Bon, Kinshasa', center: [15.3, -4.3], place_type: ['address'] },
        { id: 'b', text: 'Sans position', place_name: 'x' },
        { id: 'c', text: 'Hors plage', place_name: 'y', center: [15.3, 95] },
        { id: 'd', text: 'Île nulle', place_name: 'z', center: [0, 0] },
      ],
    });
    expect(r).toHaveLength(1);
    expect(r[0].precision).toBe('precise');
    expect(parseNominatim([{ lat: 'abc', lon: 'def', display_name: 'x' }])).toHaveLength(0);
  });
});
