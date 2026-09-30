import type { StyleSpecification } from 'maplibre-gl';

/* ============================================================================
 * map-config.ts — architecture multi-fournisseur (MapTiler / Mapbox / Esri /
 * custom) pour une VRAIE carte mondiale (rues, bâtiments, POI réels).
 *
 * AUCUNE carte fictive, AUCUNE coordonnée HEC/Kinshasa codée en dur ici :
 * ce fichier ne fait QUE résoudre une config de style pour un mode donné.
 * Le centrage sur le campus continue de venir des données du campus
 * (ailleurs dans le projet).
 * ========================================================================= */

export type MapStyleMode = 'plan' | 'satellite' | 'hybrid' | 'topo' | 'dark';

export const MAP_STYLE_MODES: MapStyleMode[] = [
  'plan',
  'satellite',
  'hybrid',
  'topo',
  'dark',
];

export const mapStyleLabels: Record<MapStyleMode, string> = {
  plan: 'Plan',
  satellite: 'Satellite',
  hybrid: 'Hybride',
  topo: 'Topographique',
  dark: 'Sombre',
};

/**
 * IDs des sources gérées par le style de SECOURS (voir buildOsmFallbackStyle).
 * Conservé pour compatibilité avec le code existant qui référence ces IDs ;
 * seul 'base' est réellement utilisé aujourd'hui (le secours n'a plus de
 * calque "reference" séparé — voir le rapport).
 */
export const BASE_SOURCE_IDS = ['base', 'reference'];

/* ============================================================================
 * PROVIDER ABSTRAIT
 * ========================================================================= */

export type MapProvider = 'maptiler' | 'mapbox' | 'esri' | 'custom';

/** Erreur de configuration explicite — jamais de fausse URL ni de style simulé. */
export class MapConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapConfigError';
  }
}

interface Env {
  VITE_MAP_PROVIDER?: string;
  VITE_MAP_API_KEY?: string;
  VITE_MAP_STYLE_URL?: string;
  [key: string]: string | undefined;
}

function env(): Env {
  return import.meta.env as unknown as Env;
}

function requireProvider(): MapProvider {
  const raw = env().VITE_MAP_PROVIDER?.trim().toLowerCase();
  if (!raw) {
    throw new MapConfigError(
      "Aucun fournisseur de carte n'est configuré. Définissez VITE_MAP_PROVIDER " +
        "('maptiler' | 'mapbox' | 'esri' | 'custom') dans votre .env — voir .env.example.",
    );
  }
  if (raw !== 'maptiler' && raw !== 'mapbox' && raw !== 'esri' && raw !== 'custom') {
    throw new MapConfigError(
      `VITE_MAP_PROVIDER="${raw}" est inconnu. Valeurs acceptées : maptiler, mapbox, esri, custom.`,
    );
  }
  return raw;
}

function requireApiKey(provider: Exclude<MapProvider, 'custom'>): string {
  const key = env().VITE_MAP_API_KEY?.trim();
  if (!key) {
    throw new MapConfigError(
      `VITE_MAP_API_KEY est requis pour le fournisseur "${provider}". ` +
        'Aucune clé n\'est codée en dur dans le code : configurez-la dans votre .env.',
    );
  }
  return key;
}

/** Surcharge optionnelle, par mode, de l'identifiant de style (ex. VITE_MAP_STYLE_ID_DARK). */
function styleIdOverride(mode: MapStyleMode): string | undefined {
  return env()[`VITE_MAP_STYLE_ID_${mode.toUpperCase()}`]?.trim() || undefined;
}

/** Surcharge optionnelle, par mode, d'une URL de style complète (provider 'custom'). */
function styleUrlOverride(mode: MapStyleMode): string | undefined {
  return env()[`VITE_MAP_STYLE_URL_${mode.toUpperCase()}`]?.trim() || undefined;
}

/* ----------------------------------------------------------------------------
 * Catalogue des identifiants de style connus par fournisseur.
 *
 * VÉRIFIÉ   = confirmé dans la documentation publique du fournisseur.
 * À VÉRIFIER = estimation raisonnable la plus probable, mais non confirmée
 *              formellement ; le catalogue de styles évolue par fournisseur
 *              et selon le plan souscrit. NE PAS supposer que c'est correct
 *              sans un test réel avec une clé API valide.
 *
 * Toujours surchargeable via VITE_MAP_STYLE_ID_<MODE>.
 * -------------------------------------------------------------------------- */

const MAPTILER_STYLE_IDS: Partial<Record<MapStyleMode, string>> = {
  plan: 'streets-v2', // VÉRIFIÉ — style par défaut du SDK MapTiler
  satellite: 'satellite', // À VÉRIFIER
  hybrid: 'hybrid', // VÉRIFIÉ — imagerie + labels/routes
  topo: 'topo-v2', // VÉRIFIÉ
  dark: 'dataviz-dark', // À VÉRIFIER — confirmez l'ID exact dans votre compte MapTiler
};

const MAPBOX_STYLE_IDS: Partial<Record<MapStyleMode, string>> = {
  plan: 'streets-v11', // VÉRIFIÉ
  satellite: 'satellite-v9', // VÉRIFIÉ — imagerie pure, sans labels
  hybrid: 'satellite-streets-v11', // VÉRIFIÉ — imagerie + labels/routes
  topo: 'outdoors-v11', // VÉRIFIÉ — le style Mapbox le plus proche d'un "topo"
  dark: 'dark-v10', // VÉRIFIÉ
};

const ESRI_BASEMAP_STYLE_IDS: Partial<Record<MapStyleMode, string>> = {
  plan: 'ArcGIS:Streets', // VÉRIFIÉ
  satellite: 'ArcGIS:Imagery', // VÉRIFIÉ
  hybrid: 'ArcGIS:Imagery', // À VÉRIFIER — aucun style "hybride" (imagerie+labels)
  // confirmé publiquement dans le catalogue vectoriel Esri au moment de l'écriture ;
  // à défaut on retombe sur l'imagerie seule (SANS labels garantis). Ne pas
  // annoncer "Hybride" comme pleinement fonctionnel tant que ce n'est pas vérifié
  // dans votre compte ArcGIS.
  topo: 'ArcGIS:Topographic', // VÉRIFIÉ
  dark: 'ArcGIS:DarkGray', // À VÉRIFIER
};

/** Attribution minimale attendue par fournisseur (à confirmer selon votre plan). */
const PROVIDER_ATTRIBUTION: Record<MapProvider, string> = {
  maptiler:
    '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © OpenStreetMap contributors',
  mapbox: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © OpenStreetMap contributors',
  esri: '© <a href="https://www.esri.com">Esri</a>',
  custom: "Fond de carte fourni par l'administration",
};

function maptilerStyleUrl(mode: MapStyleMode, apiKey: string): string {
  const id = styleIdOverride(mode) ?? MAPTILER_STYLE_IDS[mode];
  if (!id) {
    throw new MapConfigError(
      `Le mode "${mode}" n'est pas défini pour MapTiler. Définissez ` +
        `VITE_MAP_STYLE_ID_${mode.toUpperCase()} avec un ID de style existant, ou changez de fournisseur.`,
    );
  }
  return `https://api.maptiler.com/maps/${id}/style.json?key=${encodeURIComponent(apiKey)}`;
}

function mapboxStyleUrl(mode: MapStyleMode, apiKey: string): string {
  const id = styleIdOverride(mode) ?? MAPBOX_STYLE_IDS[mode];
  if (!id) {
    throw new MapConfigError(
      `Le mode "${mode}" n'est pas défini pour Mapbox. Définissez ` +
        `VITE_MAP_STYLE_ID_${mode.toUpperCase()} avec un ID de style existant, ou changez de fournisseur.`,
    );
  }
  // IMPORTANT (compatibilité MapLibre — §11 du cahier des charges) :
  // MapLibre GL JS (contrairement à Mapbox GL JS) NE résout PAS le schéma
  // "mapbox://styles/...". Ce support a été retiré à partir de MapLibre 2.x.
  // On utilise donc l'endpoint HTTPS public de la Styles API Mapbox.
  return `https://api.mapbox.com/styles/v1/mapbox/${id}?access_token=${encodeURIComponent(apiKey)}`;
}

function esriStyleUrl(mode: MapStyleMode, apiKey: string): string {
  const id = styleIdOverride(mode) ?? ESRI_BASEMAP_STYLE_IDS[mode];
  if (!id) {
    throw new MapConfigError(
      `Le mode "${mode}" n'est pas défini pour Esri. Définissez ` +
        `VITE_MAP_STYLE_ID_${mode.toUpperCase()} avec un style existant, ou changez de fournisseur.`,
    );
  }
  // Service "basemap layer" actuel d'Esri (les anciens endpoints raster gratuits
  // sans clé — server.arcgisonline.com — sont en fin de support, voir rapport).
  return `https://basemaps-api.arcgis.com/arcgis/rest/services/styles/${id}?type=style&token=${encodeURIComponent(apiKey)}`;
}

function customStyleUrl(mode: MapStyleMode): string {
  const url = styleUrlOverride(mode) ?? env().VITE_MAP_STYLE_URL?.trim();
  if (!url) {
    throw new MapConfigError(
      `Fournisseur "custom" sélectionné mais aucune URL de style n'est configurée pour le mode "${mode}". ` +
        `Définissez VITE_MAP_STYLE_URL (tous les modes) ou VITE_MAP_STYLE_URL_${mode.toUpperCase()} (ce mode uniquement).`,
    );
  }
  return url;
}

/* ----------------------------------------------------------------------------
 * SECOURS RÉEL — utilisé uniquement quand CampusMap confirme l'échec de la
 * source primaire (map.on('error')) et rappelle getMapStyle(mode, true).
 * Tuiles OSM standard : réelles, publiques, gratuites, sans clé. Toujours la
 * même carte, quel que soit le mode demandé : mieux vaut une carte réelle et
 * générique qu'un mode inexistant ou une carte blanche présentée comme
 * fonctionnelle (interdit par le cahier des charges).
 * -------------------------------------------------------------------------- */

const OSM_FALLBACK = {
  tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  tileSize: 256,
  maxzoom: 19,
} as const;

function buildOsmFallbackStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: [...OSM_FALLBACK.tiles],
        tileSize: OSM_FALLBACK.tileSize,
        attribution: OSM_FALLBACK.attribution,
        maxzoom: OSM_FALLBACK.maxzoom,
      },
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  };
}

function maxZoomFor(mode: MapStyleMode): number {
  // Valeurs standards de l'industrie pour ce type de contenu (imagerie
  // satellite vs. rues vectorielles) ; à ajuster si votre plan/fournisseur
  // documente une valeur différente pour votre compte.
  return mode === 'satellite' || mode === 'hybrid' ? 19 : 20;
}

/* ============================================================================
 * API PUBLIQUE
 * ========================================================================= */

/**
 * Construit le style pour le mode demandé.
 *
 * Retourne une URL de style.json (string) pour un fournisseur vectoriel réel
 * (MapTiler / Mapbox / Esri / custom), ou un objet StyleSpecification complet
 * pour le secours OSM. Les deux formes sont acceptées telles quelles par
 * `new maplibregl.Map({ style })` et par `map.setStyle(style)`.
 *
 * `useFallback` est utilisé par CampusMap après un échec confirmé de la
 * source primaire (voir le commentaire "SECOURS RÉEL" ci-dessus).
 *
 * Lève une MapConfigError explicite si aucun fournisseur n'est configuré, si
 * la clé API requise manque, ou si le mode demandé n'existe pas chez le
 * fournisseur configuré. Jamais de secours silencieux vers une fausse URL.
 */
export function getMapStyle(mode: MapStyleMode, useFallback = false): string | StyleSpecification {
  if (useFallback) {
    return buildOsmFallbackStyle();
  }
  const provider = requireProvider();
  switch (provider) {
    case 'maptiler':
      return maptilerStyleUrl(mode, requireApiKey('maptiler'));
    case 'mapbox':
      return mapboxStyleUrl(mode, requireApiKey('mapbox'));
    case 'esri':
      return esriStyleUrl(mode, requireApiKey('esri'));
    case 'custom':
      return customStyleUrl(mode);
  }
}

/**
 * Métadonnées de source pour un mode donné (attribution, secours, zoom max).
 *
 * COMPATIBILITÉ : pour un fournisseur vectoriel, `tiles` contient désormais
 * l'URL du style.json résolu (un seul élément), et non plus un gabarit de
 * tuiles XYZ brut — c'est inhérent au passage à de vrais styles vectoriels.
 * Le champ est conservé (même forme `string[]`) pour ne pas casser le code
 * existant qui importe cette fonction, mais toute nouvelle intégration
 * devrait utiliser getMapStyle() directement.
 */
export interface RasterSourceConfig {
  tiles: string[];
  fallbackTiles?: string[];
  attribution: string;
  tileSize?: number;
  maxzoom?: number;
}

export function getSourceConfig(mode: MapStyleMode): RasterSourceConfig {
  const provider = requireProvider();
  const resolved = getMapStyle(mode) as string; // toujours une URL en dehors du secours
  return {
    tiles: [resolved],
    fallbackTiles: [...OSM_FALLBACK.tiles],
    attribution: PROVIDER_ATTRIBUTION[provider],
    tileSize: 256,
    maxzoom: maxZoomFor(mode),
  };
}

/**
 * Vrai si le mode utilise l'ID de style intégré au module pour le fournisseur
 * courant (aucune surcharge VITE_MAP_STYLE_ID_<MODE> / VITE_MAP_STYLE_URL_<MODE>
 * fournie par l'administration pour ce mode précis).
 */
export function isDefaultProvider(mode: MapStyleMode): boolean {
  return !styleIdOverride(mode) && !styleUrlOverride(mode);
}

/* ----------------------------------------------------------------------------
 * OPTIONS DE CARTE MAPLIBRE (§8 du cahier des charges)
 * -------------------------------------------------------------------------- */

export interface MapViewOptions {
  minZoom: number;
  maxZoom: number;
  pitch: number;
  bearing: number;
  antialias: boolean;
  projection: 'mercator';
}

/**
 * Options MapLibre recommandées pour un mode donné. Non branchées
 * automatiquement dans `new maplibregl.Map()` — CampusMap.tsx étant hors
 * périmètre de cette tâche, cet export est prêt à être consommé par un futur
 * ticket qui touchera ce fichier.
 */
export function getMapViewOptions(mode: MapStyleMode): MapViewOptions {
  return {
    minZoom: 2, // évite de streamer inutilement le niveau "monde entier" sur réseau lent
    maxZoom: maxZoomFor(mode), // dérivé du mode réel, jamais une valeur arbitraire
    pitch: 0, // vue 2D nord/haut : suffisant pour un plan de campus, moins coûteux qu'un pitch 3D
    bearing: 0, // nord en haut, plus lisible pour la navigation piétonne
    antialias: false, // pas d'extrusions 3D/terrain ici : économise le GPU sur mobile/réseau lent
    projection: 'mercator', // supporté par toutes les versions de MapLibre ;
    // 'globe' n'existe qu'à partir de MapLibre 4+ — à activer seulement après
    // vérification de la version réellement installée dans le projet.
  };
}