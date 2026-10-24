import { describe, expect, it } from 'vitest';
import {
  TRANSIENT_FAILURE_THRESHOLD,
  classifyMapError,
  decideMapErrorAction,
  isBaseMapSource,
  pickTextFont,
} from '../map-resilience';

describe('classifyMapError', () => {
  it('ignore les sources applicatives (route, POI externes)', () => {
    expect(classifyMapError({ sourceId: 'route' })).toBe('app');
    expect(classifyMapError({ sourceId: 'external-pois' })).toBe('app');
  });

  it('reconnaît une panne de tuiles d\'un style vectoriel (source non nommée "base")', () => {
    // Régression : avant, seules 'base'/'reference' étaient reconnues.
    expect(classifyMapError({ sourceId: 'openmaptiles', error: { status: 0 } })).toBe('transient');
    expect(classifyMapError({ sourceId: 'composite', error: { status: 503 } })).toBe('transient');
  });

  it('traite 401/403/429 comme une panne persistante (clé, domaine, quota)', () => {
    expect(classifyMapError({ sourceId: 'openmaptiles', error: { status: 403 } })).toBe('persistent');
    expect(classifyMapError({ error: { status: 401, url: 'https://api.maptiler.com/maps/x/style.json' } })).toBe('persistent');
    expect(classifyMapError({ sourceId: 'x', error: { status: 429 } })).toBe('persistent');
  });

  it('ne compte pas une erreur de glyphes ou de sprite comme une panne de fond', () => {
    expect(
      classifyMapError({ error: { status: 404, url: 'https://api.maptiler.com/fonts/Noto%20Sans%20Bold/0-255.pbf' } }),
    ).toBe('asset');
    expect(classifyMapError({ error: { message: 'Unable to load glyph range' } })).toBe('asset');
    expect(classifyMapError({ error: { status: 404, url: 'https://x/sprite@2x.json' } })).toBe('asset');
  });

  // MODIFIÉ (audit cartographie) : ce test affirmait qu'un style.json en échec était un échec
  // « passager » (ignoré jusqu'à 4 fois). Or MapLibre ne réessaie pas un style et conserve alors
  // l'ANCIEN fond affiché : l'interface annonçait un mode que la carte ne montrait pas. Un style
  // illisible est désormais une panne de style (repli immédiat et message honnête).
  it('une erreur de style.json sans sourceId est une panne de style (repli immédiat)', () => {
    expect(classifyMapError({ error: { status: 0, url: 'https://x/style.json' } })).toBe('style');
  });
});

describe('decideMapErrorAction', () => {
  it('ignore les échecs passagers isolés puis bascule au seuil', () => {
    let streak = 0;
    for (let i = 1; i < TRANSIENT_FAILURE_THRESHOLD; i++) {
      const r = decideMapErrorAction({ kind: 'transient', transientStreak: streak, fallbackActive: false });
      expect(r.action).toBe('ignore');
      streak = r.transientStreak;
    }
    const last = decideMapErrorAction({ kind: 'transient', transientStreak: streak, fallbackActive: false });
    expect(last.action).toBe('fallback');
    expect(last.transientStreak).toBe(0);
  });

  it('bascule immédiatement sur une panne persistante (403)', () => {
    expect(decideMapErrorAction({ kind: 'persistent', transientStreak: 0, fallbackActive: false }).action).toBe('fallback');
  });

  it('signale l\'erreur (sans boucle) quand le secours est déjà actif', () => {
    expect(decideMapErrorAction({ kind: 'persistent', transientStreak: 0, fallbackActive: true }).action).toBe('report');
  });

  it('ne change rien pour app/asset', () => {
    expect(decideMapErrorAction({ kind: 'asset', transientStreak: 2, fallbackActive: false })).toEqual({
      action: 'ignore',
      transientStreak: 2,
    });
    expect(decideMapErrorAction({ kind: 'app', transientStreak: 3, fallbackActive: false }).action).toBe('ignore');
  });
});

describe('isBaseMapSource', () => {
  it('distingue le fond de carte des sources de l\'application', () => {
    expect(isBaseMapSource('openmaptiles')).toBe(true);
    expect(isBaseMapSource('route')).toBe(false);
    expect(isBaseMapSource(undefined)).toBe(false);
  });
});

describe('pickTextFont', () => {
  it('renvoie null sans serveur de glyphes (fond raster de secours)', () => {
    expect(pickTextFont({ layers: [{ type: 'raster' }] })).toBeNull();
    expect(pickTextFont(null)).toBeNull();
  });

  it('réutilise une police grasse déjà employée par le style du fournisseur', () => {
    const style = {
      glyphs: 'https://x/fonts/{fontstack}/{range}.pbf',
      layers: [
        { type: 'symbol', layout: { 'text-font': ['Open Sans Regular'] } },
        { type: 'symbol', layout: { 'text-font': ['Open Sans Bold'] } },
      ],
    };
    expect(pickTextFont(style)).toEqual(['Open Sans Bold']);
  });

  it('retombe sur la police historique si le style n\'en déclare aucune', () => {
    expect(pickTextFont({ glyphs: 'https://x/{fontstack}/{range}.pbf', layers: [] })).toEqual(['Noto Sans Bold']);
  });
});

import { effectiveMaxZoom, focusZoom } from '../map-resilience';

describe('effectiveMaxZoom / focusZoom', () => {
  it('limite le zoom au maxzoom déclaré par la source raster, jamais au-dessus', () => {
    expect(effectiveMaxZoom(19, [17])).toBe(17);
    expect(effectiveMaxZoom(19, [20])).toBe(19);
    expect(effectiveMaxZoom(19, [undefined])).toBe(19);
    expect(effectiveMaxZoom(19, [])).toBe(19);
    expect(effectiveMaxZoom(19, [18, 16])).toBe(16);
  });

  it('ne force jamais un zoom supérieur à la limite réelle', () => {
    expect(focusZoom(15, 19)).toBe(18);
    expect(focusZoom(15, 17)).toBe(17);
    expect(focusZoom(18.5, 19)).toBe(18.5);
  });
});

import { readFallbackCampus } from '../map-resilience';

describe('readFallbackCampus', () => {
  it('exige un centre valide fourni par l\'administration ; ne l\'invente jamais', () => {
    expect(readFallbackCampus({})).toBeNull();
    expect(readFallbackCampus({ VITE_FALLBACK_CENTER_LNG: '15.3' })).toBeNull();
    expect(readFallbackCampus({ VITE_FALLBACK_CENTER_LNG: '0', VITE_FALLBACK_CENTER_LAT: '0' })).toBeNull();
    expect(readFallbackCampus({ VITE_FALLBACK_CENTER_LNG: '500', VITE_FALLBACK_CENTER_LAT: '1' })).toBeNull();
  });
  it('accepte un centre valide et borne le zoom', () => {
    const c = readFallbackCampus({ VITE_FALLBACK_CENTER_LNG: '15.3', VITE_FALLBACK_CENTER_LAT: '-4.3', VITE_FALLBACK_ZOOM: '99' });
    expect(c).toMatchObject({ center_lng: 15.3, center_lat: -4.3, default_zoom: 14 });
  });
});
