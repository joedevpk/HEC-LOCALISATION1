import type { ExternalPOI, POICategory } from '@/lib/poi-categories';
import { toLngLat } from '@/lib/geo-validation';

// ---------------------------------------------------------------------
// POI externes réels (ÉTAPES 3, 17 et 23 du cahier des charges) : les
// lieux publics autour du campus (écoles, hôpitaux, banques…) viennent
// d'Overpass API, l'API publique et gratuite (aucune clé requise) qui
// interroge les données OpenStreetMap. Aucune donnée n'est jamais
// inventée : si l'API échoue, `fetchExternalPOIs` lève une erreur —
// c'est à l'appelant (MapPage) de l'afficher clairement, jamais de
// remplacer par un faux lieu.
// ---------------------------------------------------------------------

/** Override possible via .env si l'admin préfère un miroir Overpass dédié
 * (le service public est partagé et parfois limité en débit). */
const OVERPASS_URL =
  (import.meta.env.VITE_OVERPASS_URL as string | undefined)?.trim() ||
  'https://overpass-api.de/api/interpreter';

const TIMEOUT_MS = parsePositiveIntEnv(import.meta.env.VITE_OVERPASS_TIMEOUT_MS, 12_000);
const CACHE_TTL_MS = parsePositiveIntEnv(import.meta.env.VITE_POI_CACHE_TTL_MS, 10 * 60 * 1000);
const MAX_BBOX_DEGREES = parsePositiveIntEnv(import.meta.env.VITE_POI_MAX_BBOX_DEGREES, 1) || 1;
const RESULT_LIMIT = parsePositiveIntEnv(import.meta.env.VITE_POI_RESULT_LIMIT, 200);
const MAX_RETRIES = parsePositiveIntEnv(import.meta.env.VITE_OVERPASS_MAX_RETRIES, 2);
const RETRY_BASE_DELAY_MS = 500;

function parsePositiveIntEnv(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Correspondance tag OSM -> catégorie de l'app. Seuls ces tags sont
// interrogés (voir buildOverpassQuery) : on ne demande jamais "tout",
// pour rester rapide et pertinent autour d'un campus.
const AMENITY_TO_CATEGORY: Record<string, POICategory> = {
  school: 'school',
  university: 'school',
  college: 'school',
  kindergarten: 'school',
  hospital: 'hospital',
  clinic: 'hospital',
  doctors: 'hospital',
  pharmacy: 'pharmacy',
  bank: 'bank',
  place_of_worship: 'church',
  restaurant: 'restaurant',
  fast_food: 'restaurant',
  cafe: 'restaurant',
  marketplace: 'market',
  fuel: 'gas_station',
  police: 'police',
  townhall: 'government',
  courthouse: 'government',
  parking: 'parking',
  bus_station: 'transport',
  library: 'library',
};
const SHOP_TO_CATEGORY: Record<string, POICategory> = {
  supermarket: 'market',
  convenience: 'market',
  mall: 'shop',
};
const LEISURE_TO_CATEGORY: Record<string, POICategory> = {
  stadium: 'stadium',
  sports_centre: 'stadium',
  pitch: 'stadium',
};
const TOURISM_TO_CATEGORY: Record<string, POICategory> = {
  hotel: 'hotel',
  guest_house: 'hotel',
};
const RAILWAY_HIGHWAY_TO_CATEGORY: Record<string, POICategory> = {
  station: 'transport',
  bus_stop: 'transport',
};

export interface LngLatBoundsLike {
  west: number;
  south: number;
  east: number;
  north: number;
}

// ---------------------------------------------------------------------
// Erreurs différenciées (point 6 du brief) — l'UI peut brancher sur
// `error.kind` pour afficher un message adapté sans parser du texte.
// ---------------------------------------------------------------------

export type OverpassErrorKind =
  | 'invalid_bbox'
  | 'timeout'
  | 'abort'
  | 'rate_limited'
  | 'server_error'
  | 'network_error'
  | 'invalid_json'
  | 'invalid_response';

export class OverpassError extends Error {
  constructor(
    message: string,
    public readonly kind: OverpassErrorKind,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OverpassError';
  }
}

/** Une annulation demandée par l'appelant (changement de carte, démontage
 * du composant…) n'est jamais une "erreur" côté UI (point 10 du brief). */
export function isUserAbort(error: unknown): boolean {
  return error instanceof OverpassError && error.kind === 'abort';
}

// ---------------------------------------------------------------------
// Validation de bbox (point 1 du brief)
// ---------------------------------------------------------------------

function validateBbox(bbox: LngLatBoundsLike): void {
  const { west, south, east, north } = bbox;
  const values = [west, south, east, north];
  if (values.some((v) => typeof v !== 'number' || Number.isNaN(v) || !Number.isFinite(v))) {
    throw new OverpassError('Zone de carte invalide (valeur non numérique).', 'invalid_bbox');
  }
  if (west < -180 || west > 180 || east < -180 || east > 180) {
    throw new OverpassError('Longitude hors limites (-180 à 180).', 'invalid_bbox');
  }
  if (south < -90 || south > 90 || north < -90 || north > 90) {
    throw new OverpassError('Latitude hors limites (-90 à 90).', 'invalid_bbox');
  }
  if (south >= north) {
    throw new OverpassError('Zone de carte invalide : south doit être < north.', 'invalid_bbox');
  }
  if (west >= east) {
    throw new OverpassError('Zone de carte invalide : west doit être < east.', 'invalid_bbox');
  }
  if (north - south > MAX_BBOX_DEGREES || east - west > MAX_BBOX_DEGREES) {
    throw new OverpassError(
      `Zone de carte trop grande (max ${MAX_BBOX_DEGREES}° par côté) — zoomez avant de réessayer.`,
      'invalid_bbox',
    );
  }
}

function buildOverpassQuery(bbox: LngLatBoundsLike): string {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const amenity = Object.keys(AMENITY_TO_CATEGORY).join('|');
  const shop = Object.keys(SHOP_TO_CATEGORY).join('|');
  const leisure = Object.keys(LEISURE_TO_CATEGORY).join('|');
  const tourism = Object.keys(TOURISM_TO_CATEGORY).join('|');
  // out center <limit> -> la carte ne doit jamais se charger avec des
  // milliers de points d'un coup (ÉTAPE 17, performance). Limite
  // configurable via VITE_POI_RESULT_LIMIT.
  return `
    [out:json][timeout:15];
    (
      node["amenity"~"^(${amenity})$"](${bboxStr});
      way["amenity"~"^(${amenity})$"](${bboxStr});
      node["shop"~"^(${shop})$"](${bboxStr});
      node["leisure"~"^(${leisure})$"](${bboxStr});
      way["leisure"~"^(${leisure})$"](${bboxStr});
      node["tourism"~"^(${tourism})$"](${bboxStr});
      node["railway"="station"](${bboxStr});
      node["highway"="bus_stop"](${bboxStr});
    );
    out center ${RESULT_LIMIT};
  `.trim();
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function categoryFromTags(tags: Record<string, string>): POICategory | null {
  if (tags.amenity && AMENITY_TO_CATEGORY[tags.amenity]) return AMENITY_TO_CATEGORY[tags.amenity];
  if (tags.shop && SHOP_TO_CATEGORY[tags.shop]) return SHOP_TO_CATEGORY[tags.shop];
  if (tags.leisure && LEISURE_TO_CATEGORY[tags.leisure]) return LEISURE_TO_CATEGORY[tags.leisure];
  if (tags.tourism && TOURISM_TO_CATEGORY[tags.tourism]) return TOURISM_TO_CATEGORY[tags.tourism];
  if (tags.railway && RAILWAY_HIGHWAY_TO_CATEGORY[tags.railway])
    return RAILWAY_HIGHWAY_TO_CATEGORY[tags.railway];
  if (tags.highway && RAILWAY_HIGHWAY_TO_CATEGORY[tags.highway])
    return RAILWAY_HIGHWAY_TO_CATEGORY[tags.highway];
  return null;
}

/** Retire toute balise HTML d'une valeur texte issue d'OSM avant qu'elle
 * n'atteigne l'UI (point 11 du brief) — les tags OSM sont du texte libre
 * saisi par des tiers, jamais du HTML de confiance. */
function sanitizeText(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function normalizeElement(el: OverpassElement): ExternalPOI | null {
  const tags = el.tags ?? {};
  const rawName = tags.name?.trim();
  // Sans nom, un marqueur n'est pas exploitable pour l'utilisateur — on
  // l'ignore plutôt que d'afficher "Sans nom" pour 200 points (bruit).
  if (!rawName) return null;
  const name = sanitizeText(rawName);
  if (!name) return null;
  const category = categoryFromTags(tags);
  if (!category) return null;
  const rawLat = el.lat ?? el.center?.lat;
  const rawLng = el.lon ?? el.center?.lon;
  const pos = toLngLat(rawLng, rawLat);
  if (!pos) return null;
  const [lng, lat] = pos;
  // Refuse [0,0] : jamais une position OSM plausible pour un POI autour
  // du campus, plutôt le signe d'une donnée manquante côté source.
  if (lat === 0 && lng === 0) return null;
  const rawDescription = tags['addr:street'] || tags.operator || undefined;
  return {
    id: `osm:${el.type}/${el.id}`,
    name,
    category,
    lng,
    lat,
    description: rawDescription ? sanitizeText(rawDescription) : undefined,
    source: 'osm',
  };
}

/** Déduplique par clé stable "type OSM + id OSM" (point 8 du brief) — la
 * même entité peut techniquement apparaître deux fois si plusieurs
 * filtres de la requête la matchent. */
function dedupePOIs(pois: ExternalPOI[]): ExternalPOI[] {
  const byId = new Map<string, ExternalPOI>();
  for (const poi of pois) {
    if (!byId.has(poi.id)) byId.set(poi.id, poi);
  }
  return [...byId.values()];
}

// ---------------------------------------------------------------------
// Cache mémoire (point 3 du brief)
// clé = bbox arrondie à ~250 m près, TTL configurable, purge des entrées
// expirées à chaque accès (le volume reste faible : pas besoin d'un
// minuteur dédié), et déduplication des requêtes en vol pour éviter deux
// appels Overpass identiques en parallèle (ex. deux composants montés en
// même temps sur la même zone).
// ---------------------------------------------------------------------

interface CacheEntry {
  at: number;
  pois: ExternalPOI[];
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ExternalPOI[]>>();

function cacheKey(bbox: LngLatBoundsLike): string {
  const round = (n: number) => Math.round(n * 400) / 400; // ~250 m de grille
  return [round(bbox.west), round(bbox.south), round(bbox.east), round(bbox.north)].join(',');
}

function pruneExpiredCacheEntries(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.at >= CACHE_TTL_MS) cache.delete(key);
  }
}

// ---------------------------------------------------------------------
// Timeout + combinaison de signaux (point 2 du brief)
// ---------------------------------------------------------------------

/** Combine le signal éventuel de l'appelant avec un timeout interne, sans
 * dépendre de `AbortSignal.any` (pas garanti disponible partout). */
function createFetchController(userSignal?: AbortSignal): {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;

  if (userSignal?.aborted) {
    controller.abort();
  }
  const onUserAbort = () => controller.abort();
  userSignal?.addEventListener('abort', onUserAbort);

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      userSignal?.removeEventListener('abort', onUserAbort);
    },
    didTimeout: () => timedOut,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/** Une seule tentative de fetch Overpass. Ne fait aucun retry — c'est le
 * rôle de `fetchWithRetry`. */
async function fetchOverpassOnce(
  query: string,
  userSignal?: AbortSignal,
): Promise<OverpassElement[]> {
  const { signal, cleanup, didTimeout } = createFetchController(userSignal);
  let response: Response;
  try {
    response = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal,
    });
  } catch (err) {
    cleanup();
    if (userSignal?.aborted) {
      throw new OverpassError('Requête annulée.', 'abort', err);
    }
    if (didTimeout()) {
      throw new OverpassError(
        `Le service de lieux publics n'a pas répondu dans le délai imparti (${TIMEOUT_MS} ms).`,
        'timeout',
        err,
      );
    }
    throw new OverpassError(
      'Impossible de contacter le service de lieux publics (OpenStreetMap). Vérifiez votre connexion.',
      'network_error',
      err,
    );
  }
  cleanup();

  if (!response.ok) {
    if (response.status === 429) {
      throw new OverpassError('Trop de requêtes vers le service de lieux publics.', 'rate_limited');
    }
    if (RETRYABLE_STATUSES.has(response.status)) {
      throw new OverpassError(
        `Service de lieux publics temporairement indisponible (${response.status}).`,
        'server_error',
      );
    }
    throw new OverpassError(`Service de lieux publics indisponible (${response.status}).`, 'invalid_response');
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    throw new OverpassError('Réponse du service de lieux publics illisible (JSON invalide).', 'invalid_json', err);
  }
  const elements = (json as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) {
    throw new OverpassError('Réponse du service de lieux publics dans un format inattendu.', 'invalid_response');
  }
  return elements as OverpassElement[];
}

/** Retry limité (point 5 du brief) : uniquement pour les erreurs
 * temporaires (429/502/503/504/réseau), avec un petit backoff
 * exponentiel, jamais pour un timeout, un abort ou une erreur de
 * validation/parsing (qui ne se résoudront pas en réessayant). */
async function fetchWithRetry(query: string, userSignal?: AbortSignal): Promise<OverpassElement[]> {
  let lastError: OverpassError | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchOverpassOnce(query, userSignal);
    } catch (err) {
      if (!(err instanceof OverpassError)) throw err;
      lastError = err;
      const retryable = err.kind === 'rate_limited' || err.kind === 'server_error' || err.kind === 'network_error';
      if (!retryable || attempt === MAX_RETRIES || userSignal?.aborted) {
        throw err;
      }
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
  // Inatteignable en pratique (la boucle retourne ou lève toujours), mais
  // satisfait TypeScript strict.
  throw lastError ?? new OverpassError('Échec inconnu du service de lieux publics.', 'network_error');
}

export async function fetchExternalPOIs(
  bbox: LngLatBoundsLike,
  signal?: AbortSignal,
): Promise<ExternalPOI[]> {
  validateBbox(bbox);
  pruneExpiredCacheEntries();

  const key = cacheKey(bbox);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.pois;

  // Déduplication des requêtes en vol : si un appel identique est déjà en
  // cours (ex. deux composants montés sur la même zone), on partage le
  // même résultat au lieu d'interroger Overpass deux fois.
  const pending = inFlight.get(key);
  if (pending) return pending;

  const query = buildOverpassQuery(bbox);
  const request = (async () => {
    try {
      const elements = await fetchWithRetry(query, signal);
      if (signal?.aborted) {
        throw new OverpassError('Requête annulée.', 'abort');
      }
      const pois = dedupePOIs(elements.map(normalizeElement).filter((p): p is ExternalPOI => p !== null));
      cache.set(key, { at: Date.now(), pois });
      return pois;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}