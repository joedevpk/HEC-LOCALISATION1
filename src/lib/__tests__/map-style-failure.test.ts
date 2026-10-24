import { describe, expect, it } from 'vitest';
import {
  classifyMapError,
  decideMapErrorAction,
  fallbackReasonFor,
  isStyleDocumentUrl,
  maskSecretsInUrl,
} from '../map-resilience';

// Clé FICTIVE de test.
const STYLE = 'https://api.maptiler.com/maps/dataviz-dark/style.json?key=TESTKEY';

describe('échec du document de style (mode annoncé ≠ fond affiché)', () => {
  it('un 404 sur le style.json (identifiant inexistant) est une panne de style, pas un échec « passager »', () => {
    const e = { error: { status: 404, url: STYLE, message: 'Not Found' } };
    expect(classifyMapError(e, { activeStyleUrl: STYLE })).toBe('style');
    // Sans contexte, l'URL suffit aussi à reconnaître un document de style.
    expect(classifyMapError(e)).toBe('style');
  });

  it('un échec réseau sur le style (sans statut) déclenche aussi le repli immédiat', () => {
    const e = { error: { url: STYLE, message: 'Failed to fetch' } };
    const kind = classifyMapError(e, { activeStyleUrl: STYLE });
    expect(kind).toBe('style');
    expect(decideMapErrorAction({ kind, transientStreak: 0, fallbackActive: false }).action).toBe('fallback');
  });

  it('si le secours est déjà actif, un échec de style est signalé (« report »), jamais en boucle', () => {
    expect(decideMapErrorAction({ kind: 'style', transientStreak: 0, fallbackActive: true }).action).toBe('report');
  });

  it('une tuile manquante (avec sourceId) reste un échec passager : pas de repli sur un 404 isolé', () => {
    const tile = { sourceId: 'satellite', error: { status: 404, url: 'https://api.maptiler.com/tiles/satellite-v2/19/1/2.jpg?key=K' } };
    const kind = classifyMapError(tile, { activeStyleUrl: STYLE });
    expect(kind).toBe('transient');
    expect(decideMapErrorAction({ kind, transientStreak: 0, fallbackActive: false }).action).toBe('ignore');
  });

  it('glyphes et sprites ne sont jamais pris pour un échec de style', () => {
    const glyph = { error: { status: 404, url: 'https://api.maptiler.com/fonts/Noto%20Sans%20Bold/0-255.pbf?key=K' } };
    const sprite = { error: { status: 404, url: 'https://api.maptiler.com/maps/streets-v2/sprite@2x.json?key=K' } };
    expect(classifyMapError(glyph)).toBe('asset');
    expect(classifyMapError(sprite)).toBe('asset');
  });

  it('401/403 sur le style restent attribués à un problème d’accès (clé/domaine)', () => {
    const e = { error: { status: 403, url: STYLE } };
    expect(fallbackReasonFor(classifyMapError(e, { activeStyleUrl: STYLE }), 403)).toBe('access');
    expect(fallbackReasonFor('style', 404)).toBe('style');
    expect(fallbackReasonFor('transient')).toBe('network');
  });

  it('les endpoints de style de chaque fournisseur géré sont reconnus', () => {
    expect(isStyleDocumentUrl('https://api.mapbox.com/styles/v1/mapbox/streets-v11?access_token=K')).toBe(true);
    expect(isStyleDocumentUrl('https://basemaps-api.arcgis.com/arcgis/rest/services/styles/ArcGIS:Imagery?type=style&token=K')).toBe(true);
    expect(isStyleDocumentUrl('https://tiles.example.org/mon/style.json')).toBe(true);
    expect(isStyleDocumentUrl('https://api.maptiler.com/tiles/v3/12/1/2.pbf?key=K')).toBe(false);
    expect(isStyleDocumentUrl(undefined)).toBe(false);
  });
});

describe('journaux : aucune clé dans la console', () => {
  it('masque key=, access_token=, token= et api_key=', () => {
    const raw =
      'AJAXError: Not Found (404): https://api.maptiler.com/maps/x/style.json?key=SECRETKEY123 ' +
      'et https://api.mapbox.com/styles/v1/mapbox/a?access_token=pk.SECRET&x=1 ' +
      'et https://basemaps-api.arcgis.com/s?type=style&token=ESRISECRET';
    const masked = maskSecretsInUrl(raw);
    expect(masked).not.toContain('SECRETKEY123');
    expect(masked).not.toContain('pk.SECRET');
    expect(masked).not.toContain('ESRISECRET');
    expect(masked).toContain('key=[masqué]');
    expect(masked).toContain('x=1'); // les autres paramètres sont conservés
  });
});
