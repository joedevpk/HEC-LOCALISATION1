/* ============================================================================
 * map-resilience.ts — logique PURE (sans DOM ni WebGL) qui décide comment
 * réagir aux erreurs MapLibre. Extraite de CampusMap.tsx pour être testable.
 *
 * Constat à l'origine de ce module (audit) :
 *  - l'ancien code ne reconnaissait comme "fond de carte" que les sources
 *    nommées 'base' / 'reference'. Or les styles vectoriels réels (MapTiler,
 *    Mapbox, Esri) nomment leurs sources autrement ('openmaptiles',
 *    'composite', 'esri'…) : une panne de tuiles du fournisseur n'était donc
 *    JAMAIS détectée et le secours ne se déclenchait jamais ;
 *  - une erreur de glyphes (police) n'a pas de sourceId : elle était comptée
 *    comme une panne de tuiles et pouvait déclencher un secours à tort ;
 *  - un refus d'accès (HTTP 401/403 : clé invalide ou restriction de
 *    domaine) ou un quota dépassé (429) est une panne PERSISTANTE : inutile
 *    d'attendre quatre échecs avant de le dire.
 * ========================================================================= */

/** Sources GeoJSON appartenant à l'application (jamais le fond de carte). */
export const APP_SOURCE_IDS = ['route', 'external-pois'] as const;

export type MapErrorKind =
  /** Source de l'application (itinéraire, POI externes) : n'affecte pas le fond. */
  | 'app'
  /** Police/glyphes ou sprite : dégradation cosmétique, jamais un secours. */
  | 'asset'
  /** Accès refusé ou quota dépassé (401/403/429) : panne persistante. */
  | 'persistent'
  /**
   * Le DOCUMENT de style (style.json) du mode demandé n'a pas pu être chargé
   * (identifiant inexistant → 404, clé refusée, panne réseau/5xx). Aucune
   * nouvelle tentative n'est faite par MapLibre : attendre « 4 échecs » ne
   * servirait à rien, et en attendant la carte afficherait un autre fond que
   * le mode annoncé par l'interface.
   */
  | 'style'
  /** Échec réseau / 5xx / timeout sur le fond de carte : peut être passager. */
  | 'transient';

export interface MapErrorLike {
  sourceId?: string;
  error?: { message?: string; status?: number; url?: string } | null;
}

/** Retire la chaîne de requête (où se trouvent clés/jetons) d'une URL. */
function withoutQuery(url: string): string {
  const i = url.indexOf('?');
  return (i === -1 ? url : url.slice(0, i)).toLowerCase();
}

/** Endpoints de documents de style des fournisseurs gérés (MapTiler, Mapbox, Esri, custom). */
const STYLE_DOCUMENT_PATTERNS = [
  /\/maps\/[^/]+\/style\.json$/, // MapTiler
  /\/styles\/v1\/[^/]+\/[^/]+$/, // Mapbox Styles API
  /\/arcgis\/rest\/services\/styles\/[^/]+$/, // Esri basemap styles
  /style\.json$/, // fournisseur « custom » usuel
];

/** Vrai si l'URL désigne le document de style (et non une tuile, un glyphe ou un sprite). */
export function isStyleDocumentUrl(url: string | undefined, activeStyleUrl?: string): boolean {
  if (!url) return false;
  const bare = withoutQuery(url);
  if (activeStyleUrl && withoutQuery(activeStyleUrl) === bare) return true;
  return STYLE_DOCUMENT_PATTERNS.some((re) => re.test(bare));
}

/**
 * Masque clés et jetons dans un texte/une URL destiné à la console ou aux
 * journaux : les erreurs réseau de MapLibre contiennent l'URL complète du style,
 * donc `?key=…` / `?access_token=…`.
 */
export function maskSecretsInUrl(text: string): string {
  return text.replace(/([?&](?:key|api_key|apikey|access_token|token)=)[^&\s"')]+/gi, '$1[masqué]');
}

function statusOf(e: MapErrorLike): number | undefined {
  const s = e.error?.status;
  return typeof s === 'number' ? s : undefined;
}

/** Classe une erreur MapLibre (voir MapErrorKind). `activeStyleUrl` : URL du style actuellement demandé. */
export function classifyMapError(e: MapErrorLike, ctx: { activeStyleUrl?: string } = {}): MapErrorKind {
  if (e.sourceId && (APP_SOURCE_IDS as readonly string[]).includes(e.sourceId)) return 'app';

  const url = (e.error?.url ?? '').toLowerCase();
  const message = (e.error?.message ?? '').toLowerCase();
  const looksLikeGlyph = /\/fonts?\//.test(url) || /\.pbf(\?|$)/.test(url) || message.includes('glyph');
  const looksLikeSprite = /\/sprite/.test(url) || message.includes('sprite');
  if (!e.sourceId && (looksLikeGlyph || looksLikeSprite)) return 'asset';
  // Une icône manquante est gérée par attachMissingIconFallback.
  if (message.includes('could not load image') || message.includes('image "')) return 'asset';

  // Accès refusé / quota : panne persistante (priorité historique, quel que soit le document).
  const status = statusOf(e);
  if (status === 401 || status === 403 || status === 429) return 'persistent';

  // Échec du document de style lui-même (pas de sourceId : ce n'est pas une tuile).
  if (!e.sourceId && isStyleDocumentUrl(e.error?.url, ctx.activeStyleUrl)) return 'style';

  return 'transient';
}

export type FallbackReason = 'access' | 'style' | 'network';

/** Raison affichée (aux administrateurs) quand on bascule sur le fond de secours. */
export function fallbackReasonFor(kind: MapErrorKind, status?: number): FallbackReason {
  if (kind === 'persistent' || status === 401 || status === 403 || status === 429) return 'access';
  if (kind === 'style') return 'style';
  return 'network';
}

/** Nombre d'échecs passagers consécutifs avant de parler de panne. */
export const TRANSIENT_FAILURE_THRESHOLD = 4;

/**
 * Décision pure : que faire après une erreur, étant donné l'état courant ?
 *  - 'ignore'   : on ne fait rien (échec isolé, source applicative, asset) ;
 *  - 'fallback' : basculer sur le fond de secours ;
 *  - 'report'   : le secours a déjà été essayé (ou échoue aussi) → erreur claire.
 */
export function decideMapErrorAction(args: {
  kind: MapErrorKind;
  transientStreak: number; // compteur AVANT cette erreur
  fallbackActive: boolean;
}): { action: 'ignore' | 'fallback' | 'report'; transientStreak: number } {
  const { kind, fallbackActive } = args;
  if (kind === 'app' || kind === 'asset') {
    return { action: 'ignore', transientStreak: args.transientStreak };
  }
  const streak =
    kind === 'persistent' || kind === 'style' ? TRANSIENT_FAILURE_THRESHOLD : args.transientStreak + 1;
  if (streak < TRANSIENT_FAILURE_THRESHOLD) return { action: 'ignore', transientStreak: streak };
  return { action: fallbackActive ? 'report' : 'fallback', transientStreak: 0 };
}

/** Vrai si la source appartient au fond de carte (donc preuve que le fournisseur répond). */
export function isBaseMapSource(sourceId: string | undefined): boolean {
  return !!sourceId && !(APP_SOURCE_IDS as readonly string[]).includes(sourceId);
}

/**
 * Choisit la police à utiliser pour nos propres libellés (compteur de
 * clusters) : celle déjà employée par le style du fournisseur (donc garantie
 * d'exister sur son serveur de glyphes), en préférant une variante grasse.
 * Renvoie null si le style ne définit aucun serveur de glyphes (cas du fond
 * de secours raster) : dans ce cas, aucun libellé texte ne doit être ajouté.
 */
export function pickTextFont(style: {
  glyphs?: string;
  layers?: Array<{ type?: string; layout?: Record<string, unknown> }>;
} | null | undefined): string[] | null {
  if (!style?.glyphs) return null;
  const fonts: string[][] = [];
  for (const layer of style.layers ?? []) {
    if (layer.type !== 'symbol') continue;
    const tf = layer.layout?.['text-font'];
    if (Array.isArray(tf) && tf.length > 0 && tf.every((f) => typeof f === 'string')) {
      fonts.push(tf as string[]);
    }
  }
  if (fonts.length === 0) return ['Noto Sans Bold']; // défaut historique du code
  const bold = fonts.find((f) => /bold|semibold/i.test(f[0]));
  return (bold ?? fonts[0]).slice(0, 1);
}

/**
 * Zoom maximal réellement exploitable : le plus petit entre la limite
 * configurée et le `maxzoom` déclaré par les sources raster (imagerie).
 * Au-delà du maxzoom d'une source, MapLibre étire les dernières tuiles :
 * on n'autorise donc pas ce zoom (pas de pixellisation artificielle).
 */
export function effectiveMaxZoom(configuredMax: number, rasterSourceMaxZooms: Array<number | undefined>): number {
  const declared = rasterSourceMaxZooms.filter((z): z is number => typeof z === 'number' && Number.isFinite(z) && z > 0);
  return declared.length === 0 ? configuredMax : Math.min(configuredMax, ...declared);
}

/** Zoom de focalisation (sélection d'un lieu, GPS) : 18 au plus, jamais au-delà de la limite réelle. */
export function focusZoom(currentZoom: number, maxZoom: number): number {
  return Math.min(Math.max(currentZoom, 18), maxZoom);
}

/**
 * Carte « générale » quand les données du campus (Supabase) sont indisponibles.
 * Le centre n'est JAMAIS inventé : il doit être fourni par l'administration
 * (VITE_FALLBACK_CENTER_LNG / _LAT, et _ZOOM optionnel). Sans configuration
 * valide, renvoie null et l'écran d'erreur habituel s'applique.
 */
export interface GeneralMapCampus {
  id: string;
  name: string;
  tagline: string;
  city: string;
  center_lng: number;
  center_lat: number;
  default_zoom: number;
}

export function readFallbackCampus(env: Record<string, unknown>): GeneralMapCampus | null {
  const num = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN);
  const lng = num(env.VITE_FALLBACK_CENTER_LNG);
  const lat = num(env.VITE_FALLBACK_CENTER_LAT);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90 || (lng === 0 && lat === 0)) return null;
  const z = num(env.VITE_FALLBACK_ZOOM);
  const zoom = Number.isFinite(z) && z >= 2 && z <= 20 ? z : 14;
  return {
    id: '__general_map__',
    name: 'Carte de Kinshasa',
    tagline: 'Données du campus momentanément indisponibles',
    city: 'Kinshasa',
    center_lng: lng,
    center_lat: lat,
    default_zoom: zoom,
  };
}
