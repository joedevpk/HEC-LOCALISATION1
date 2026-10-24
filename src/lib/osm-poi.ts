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

/**
 * Serveurs Overpass par défaut, dans l'ordre d'essai. Overpass est un service communautaire
 * gratuit, partagé : il répond parfois 429 (limite) ou 502/504 (surcharge). Le second serveur
 * n'est interrogé QU'EN CAS D'ÉCHEC du premier. Il s'agit d'une instance publique mondiale
 * listée sur le wiki OSM (ex-« kumi.systems »). Un miroir peut servir des données anciennes :
 * l'âge des données est contrôlé (voir VITE_OVERPASS_MAX_DATA_AGE_DAYS). Les requêtes envoyées
 * contiennent la zone affichée de la carte : retirez un serveur de la liste si cela vous gêne.
 * Pour une charge importante, hébergez votre propre instance (recommandation des mainteneurs).
 */
const DEFAULT_OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
/** Une ou plusieurs URL séparées par des virgules, essayées dans l'ordre. Une seule URL
 * dans VITE_OVERPASS_URL désactive donc le secours. */
export function parseOverpassUrls(raw: string | undefined): string[] {
  const urls = (raw ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
  return urls.length > 0 ? urls : [...DEFAULT_OVERPASS_URLS];
}
const OVERPASS_URLS = parseOverpassUrls(import.meta.env.VITE_OVERPASS_URL as string | undefined);

const TIMEOUT_MS = parsePositiveIntEnv(import.meta.env.VITE_OVERPASS_TIMEOUT_MS, 12_000);
const CACHE_TTL_MS = parsePositiveIntEnv(import.meta.env.VITE_POI_CACHE_TTL_MS, 10 * 60 * 1000);
// Zone utile : au-delà de ~3,3 km de côté (0,03°) la requête est inutilement
// lourde pour un plan de campus ; on la recentre et la réduit au lieu d'échouer.
const MAX_BBOX_DEGREES = parsePositiveFloatEnv(import.meta.env.VITE_POI_MAX_BBOX_DEGREES, 0.03);
/** Durée pendant laquelle un échec récent est mémorisé (évite de marteler un service en panne à chaque déplacement). */
const FAILURE_COOLDOWN_MS = parsePositiveIntEnv(import.meta.env.VITE_POI_FAILURE_COOLDOWN_MS, 60_000);
const RESULT_LIMIT = parsePositiveIntEnv(import.meta.env.VITE_POI_RESULT_LIMIT, 200);
const MAX_RETRIES = parsePositiveIntEnv(import.meta.env.VITE_OVERPASS_MAX_RETRIES, 2);
const RETRY_BASE_DELAY_MS = 500;
/** Repos d'un serveur après un échec : on ne le re-sollicite pas à chaque déplacement de carte. */
const ENDPOINT_COOLDOWN_MS = parsePositiveIntEnv(import.meta.env.VITE_OVERPASS_ENDPOINT_COOLDOWN_MS, 60_000);
/** Après un 429, repos plus long (le service demande qu'on cesse d'insister). */
const RATE_LIMIT_COOLDOWN_MS = Math.max(ENDPOINT_COOLDOWN_MS, 120_000);
const STALE_COOLDOWN_MS = 10 * 60_000;
/** Au-delà de cet âge, les données d'un serveur sont jugées périmées (miroir figé) ; un serveur plus frais est préféré. */
const MAX_DATA_AGE_MS = parsePositiveIntEnv(import.meta.env.VITE_OVERPASS_MAX_DATA_AGE_DAYS, 30) * 86_400_000;

function parsePositiveIntEnv(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function parsePositiveFloatEnv(raw: unknown, fallback: number): number {
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
  | 'invalid_response'
  /** Requête refusée comme mal formée (400…) : bug d'intégration, inutile d'essayer un autre serveur. */
  | 'bad_request';

export class OverpassError extends Error {
  constructor(
    message: string,
    public readonly kind: OverpassErrorKind,
    public readonly cause?: unknown,
    /** Statut HTTP éventuel de la réponse. */
    public readonly status?: number,
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
}

/** Réduit une zone trop vaste à MAX_BBOX_DEGREES de côté, centrée sur la vue :
 * seule la zone utile est interrogée (jamais d'invention de résultats). */
export function clampBbox(bbox: LngLatBoundsLike, maxDegrees = MAX_BBOX_DEGREES): LngLatBoundsLike {
  const clampAxis = (min: number, max: number): [number, number] => {
    if (max - min <= maxDegrees) return [min, max];
    const mid = (min + max) / 2;
    return [mid - maxDegrees / 2, mid + maxDegrees / 2];
  };
  const [west, east] = clampAxis(bbox.west, bbox.east);
  const [south, north] = clampAxis(bbox.south, bbox.north);
  return { west, south, east, north };
}

/** Découpe une zone en 4 quadrants égaux (requêtes complémentaires quand la limite de résultats est atteinte). */
export function splitBbox(bbox: LngLatBoundsLike): LngLatBoundsLike[] {
  const midLng = (bbox.west + bbox.east) / 2;
  const midLat = (bbox.south + bbox.north) / 2;
  return [
    { west: bbox.west, south: midLat, east: midLng, north: bbox.north },
    { west: midLng, south: midLat, east: bbox.east, north: bbox.north },
    { west: bbox.west, south: bbox.south, east: midLng, north: midLat },
    { west: midLng, south: bbox.south, east: bbox.east, north: midLat },
  ];
}

export function buildOverpassQuery(bbox: LngLatBoundsLike): string {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const amenity = Object.keys(AMENITY_TO_CATEGORY).join('|');
  const shop = Object.keys(SHOP_TO_CATEGORY).join('|');
  const leisure = Object.keys(LEISURE_TO_CATEGORY).join('|');
  const tourism = Object.keys(TOURISM_TO_CATEGORY).join('|');
  // out center <limit> -> la carte ne doit jamais se charger avec des
  // milliers de points d'un coup (ÉTAPE 17, performance). Limite
  // configurable via VITE_POI_RESULT_LIMIT.
  return `
    [out:json][timeout:10];
    (
      nw["amenity"~"^(${amenity})$"]["name"](${bboxStr});
      nw["shop"~"^(${shop})$"]["name"](${bboxStr});
      nw["leisure"~"^(${leisure})$"]["name"](${bboxStr});
      node["tourism"~"^(${tourism})$"]["name"](${bboxStr});
      node["railway"="station"]["name"](${bboxStr});
      node["highway"="bus_stop"]["name"](${bboxStr});
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
  /** Vrai si la zone contient probablement plus de lieux que ceux récupérés (limite atteinte, même après découpage). */
  truncated?: boolean;
}

const cache = new Map<string, CacheEntry>();
/** Requête réseau partagée entre plusieurs appelants de la même zone. Elle a SON
 * PROPRE contrôleur d'annulation : l'abandon d'un appelant ne doit jamais
 * annuler le résultat attendu par un autre (bug corrigé : un déplacement de
 * carte dans la même cellule de cache héritait de l'annulation de la requête
 * précédente et ne chargeait aucun lieu). Elle n'est annulée que lorsque
 * TOUS ses abonnés ont abandonné. */
interface SharedRequest {
  promise: Promise<ExternalPOI[]>;
  controller: AbortController;
  subscribers: number;
  done: boolean;
}
const inFlight = new Map<string, SharedRequest>();

function subscribeToShared(shared: SharedRequest, signal?: AbortSignal): Promise<ExternalPOI[]> {
  if (signal?.aborted) return Promise.reject(new OverpassError('Requête annulée.', 'abort'));
  shared.subscribers += 1;
  return new Promise<ExternalPOI[]>((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal?.removeEventListener('abort', onAbort);
      shared.subscribers -= 1;
      if (shared.subscribers <= 0 && !shared.done) shared.controller.abort();
    };
    const onAbort = () => {
      release();
      reject(new OverpassError('Requête annulée.', 'abort'));
    };
    signal?.addEventListener('abort', onAbort);
    shared.promise.then(
      (pois) => {
        release();
        resolve(pois);
      },
      (err) => {
        release();
        reject(err);
      },
    );
  });
}

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

interface OverpassPayload {
  elements: OverpassElement[];
  /** Date des données OSM du serveur (osm3s.timestamp_osm_base), en ms, si fournie. */
  baseTimestamp?: number;
}

/** Une seule tentative de fetch Overpass sur UN serveur. Ne fait aucun retry — c'est le
 * rôle de `fetchWithRetry`. */
async function fetchOverpassOnce(
  query: string,
  userSignal: AbortSignal | undefined,
  url: string,
): Promise<OverpassPayload> {
  const { signal, cleanup, didTimeout } = createFetchController(userSignal);
  let response: Response;
  try {
    response = await fetch(url, {
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
    throw new OverpassError('Impossible de joindre le service de lieux publics. Vérifiez votre connexion.', 'network_error', err);
  }

  // Le délai reste armé jusqu'à la fin de la lecture du corps : une réponse dont
  // le corps n'arrive jamais ne doit pas bloquer la carte indéfiniment.
  try {
    if (!response.ok) throw httpFailure(response.status);

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      if (userSignal?.aborted) throw new OverpassError('Requête annulée.', 'abort', err);
      if (didTimeout()) {
        throw new OverpassError(
          `Le service de lieux publics n'a pas fini de répondre dans le délai imparti (${TIMEOUT_MS} ms).`,
          'timeout',
          err,
        );
      }
      throw new OverpassError('Réponse du service de lieux publics illisible (JSON invalide).', 'invalid_json', err);
    }
    return parseOverpassPayload(json);
  } finally {
    cleanup();
  }
}

/** Traduit un statut HTTP d'erreur. 429/5xx/403/404/408 concernent CE serveur (un autre peut
 * répondre) ; 400/413/414 viennent de NOTRE requête (inutile de changer de serveur). */
function httpFailure(status: number): OverpassError {
  if (status === 429) {
    return new OverpassError('Trop de requêtes vers le service de lieux publics.', 'rate_limited', undefined, status);
  }
  if (status === 400 || status === 413 || status === 414) {
    return new OverpassError(`Requête refusée par le service de lieux publics (${status}).`, 'bad_request', undefined, status);
  }
  if (status === 403) {
    return new OverpassError('Accès refusé par le service de lieux publics (403).', 'server_error', undefined, status);
  }
  if (status === 404) {
    return new OverpassError('Adresse du service de lieux publics introuvable (404).', 'server_error', undefined, status);
  }
  if (status >= 500 || status === 408) {
    return new OverpassError(`Service de lieux publics temporairement indisponible (${status}).`, 'server_error', undefined, status);
  }
  return new OverpassError(`Service de lieux publics indisponible (${status}).`, 'invalid_response', undefined, status);
}

/**
 * Valide une réponse Overpass. PIÈGE : Overpass peut répondre HTTP 200 avec un champ `remark`
 * « runtime error: … » (requête interrompue : délai serveur, mémoire…) et une liste d'éléments
 * vide ou partielle. La lire comme « aucun lieu » transformerait une panne en absence de
 * résultats (et la mettrait en cache). C'est donc traité comme une panne du serveur.
 */
export function parseOverpassPayload(json: unknown): OverpassPayload {
  const body = json as { elements?: unknown; remark?: unknown; osm3s?: { timestamp_osm_base?: unknown } } | null;
  if (body && typeof body.remark === 'string' && /runtime error/i.test(body.remark)) {
    throw new OverpassError(
      `Le serveur de lieux publics a interrompu la requête (${body.remark.slice(0, 100)}).`,
      'server_error',
    );
  }
  if (!body || !Array.isArray(body.elements)) {
    throw new OverpassError('Réponse du service de lieux publics dans un format inattendu.', 'invalid_response');
  }
  const ts = typeof body.osm3s?.timestamp_osm_base === 'string' ? Date.parse(body.osm3s.timestamp_osm_base) : Number.NaN;
  return { elements: body.elements as OverpassElement[], baseTimestamp: Number.isFinite(ts) ? ts : undefined };
}

// ---------------------------------------------------------------------
// Santé des serveurs et bascule
// ---------------------------------------------------------------------

interface EndpointHealth {
  until: number;
  error: OverpassError;
}
const endpointHealth = new Map<string, EndpointHealth>();

function markEndpoint(url: string, error: OverpassError, ms: number): void {
  endpointHealth.set(url, { until: Date.now() + ms, error });
}

/** Serveurs à essayer, dans l'ordre : ceux au repos sont exclus, sauf « Réessayer » (force),
 * qui les ajoute en dernier (le plus tôt disponible d'abord). */
function planEndpoints(urls: string[], force: boolean): string[] {
  const now = Date.now();
  const healthy = urls.filter((u) => (endpointHealth.get(u)?.until ?? 0) <= now);
  if (!force) return healthy;
  const cooling = urls
    .filter((u) => !healthy.includes(u))
    .sort((x, y) => (endpointHealth.get(x)?.until ?? 0) - (endpointHealth.get(y)?.until ?? 0));
  return [...healthy, ...cooling];
}

/** Erreur la plus récente connue pour ces serveurs (tous au repos). */
function lastKnownError(urls: string[]): OverpassError | undefined {
  return urls
    .map((u) => endpointHealth.get(u))
    .filter((h): h is EndpointHealth => h !== undefined)
    .sort((a, b) => b.until - a.until)[0]?.error;
}

/** Une panne qui peut disparaître en réessayant le MÊME serveur (pas un refus ni un quota). */
function isTransient(err: OverpassError): boolean {
  return (
    err.kind === 'network_error' ||
    err.kind === 'timeout' ||
    (err.kind === 'server_error' && (err.status === undefined || err.status >= 500 || err.status === 408))
  );
}

function withServerCount(err: OverpassError, tried: number): OverpassError {
  if (tried < 2) return err;
  const out = new OverpassError(`${err.message} (${tried} serveurs essayés)`, err.kind, err, err.status);
  return out;
}

/**
 * Récupère les éléments en essayant les serveurs dans l'ordre. Règles :
 * - un serveur différent à chaque tentative (429, 403, 502, délai, page HTML, `remark` d'erreur
 *   → on passe au suivant SANS réinsister sur celui qui limite) ;
 * - un serveur en échec est mis au repos : les déplacements suivants ne le re-sollicitent pas ;
 * - avec un seul serveur : au plus UNE nouvelle tentative, après délai, et seulement pour une
 *   panne transitoire (jamais après un 429 ou un 403) ;
 * - 400 (notre requête) : aucune bascule ; annulation : arrêt immédiat ;
 * - données plus vieilles que MAX_DATA_AGE_MS : un serveur plus frais est préféré ; à défaut,
 *   ces données (réelles mais anciennes) sont rendues en dernier recours plutôt qu'une panne.
 */
async function fetchWithRetry(
  query: string,
  userSignal: AbortSignal | undefined,
  urls: string[],
  force: boolean,
): Promise<OverpassElement[]> {
  const plan = planEndpoints(urls, force);
  if (plan.length === 0) {
    throw (
      lastKnownError(urls) ??
      new OverpassError('Aucun serveur de lieux publics disponible pour le moment.', 'server_error')
    );
  }
  const maxAttempts = Math.min(MAX_RETRIES + 1, Math.max(plan.length, 2));
  const tried = new Set<string>();
  let lastError: OverpassError | undefined;
  let stale: { elements: OverpassElement[]; age: number } | undefined;
  let lastWasStale = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let url = plan.find((u) => !tried.has(u));
    const repeat = url === undefined;
    if (repeat) {
      // Plus de serveur neuf : on ne réessaie le même que s'il est seul et que la panne est transitoire.
      if (plan.length !== 1 || lastWasStale || !lastError || !isTransient(lastError)) break;
      url = plan[0];
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      if (userSignal?.aborted) throw new OverpassError('Requête annulée.', 'abort');
    }
    const endpoint = url as string;
    tried.add(endpoint);
    try {
      const { elements, baseTimestamp } = await fetchOverpassOnce(query, userSignal, endpoint);
      const age = baseTimestamp === undefined ? 0 : Date.now() - baseTimestamp;
      if (age > MAX_DATA_AGE_MS) {
        const days = Math.round(age / 86_400_000);
        lastError = new OverpassError(`Données du service de lieux publics trop anciennes (${days} jours).`, 'server_error');
        markEndpoint(endpoint, lastError, STALE_COOLDOWN_MS);
        if (!stale || age < stale.age) stale = { elements, age };
        lastWasStale = true;
        continue;
      }
      endpointHealth.delete(endpoint);
      return elements;
    } catch (err) {
      if (!(err instanceof OverpassError)) throw err;
      if (err.kind === 'abort' || userSignal?.aborted) throw err;
      if (err.kind === 'bad_request') throw err;
      lastError = err;
      lastWasStale = false;
      markEndpoint(endpoint, err, err.kind === 'rate_limited' ? RATE_LIMIT_COOLDOWN_MS : ENDPOINT_COOLDOWN_MS);
    }
  }

  if (stale) {
    console.warn(`[osm-poi] Seules des données anciennes (${Math.round(stale.age / 86_400_000)} jours) sont disponibles.`);
    return stale.elements;
  }
  throw withServerCount(
    lastError ?? new OverpassError('Échec inconnu du service de lieux publics.', 'network_error'),
    tried.size,
  );
}

// Mémorisation des échecs récents (service en panne) : les déplacements
// automatiques de la carte ne relancent pas une requête vouée à l'échec ; le
// bouton « Réessayer » (force: true) l'ignore toujours.
const failures = new Map<string, { at: number; error: OverpassError }>();
const COOLDOWN_KINDS = new Set<OverpassErrorKind>([
  'timeout',
  'server_error',
  'rate_limited',
  'network_error',
  'invalid_json',
  'invalid_response',
]);

/** Vide les caches (tests, ou changement de configuration). */
export function resetPoiCaches(): void {
  cache.clear();
  inFlight.clear();
  failures.clear();
  endpointHealth.clear();
}

/** Vrai si les lieux en cache pour cette zone sont connus pour être incomplets (limite de résultats atteinte). */
export function isPoiResultTruncated(rawBbox: LngLatBoundsLike): boolean {
  try {
    const entry = cache.get(cacheKey(clampBbox(rawBbox)));
    return entry !== undefined && Boolean(entry.truncated) && Date.now() - entry.at < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export async function fetchExternalPOIs(
  rawBbox: LngLatBoundsLike,
  signal?: AbortSignal,
  /** `endpoints` : liste de serveurs imposée (tests, configuration spécifique) ; sinon VITE_OVERPASS_URL ou les défauts. */
  options: { force?: boolean; endpoints?: string[] } = {},
): Promise<ExternalPOI[]> {
  validateBbox(rawBbox);
  const bbox = clampBbox(rawBbox);
  pruneExpiredCacheEntries();

  const key = cacheKey(bbox);
  const cached = cache.get(key);
  if (cached && !options.force && Date.now() - cached.at < CACHE_TTL_MS) return cached.pois;

  const recentFailure = failures.get(key);
  if (recentFailure && !options.force && Date.now() - recentFailure.at < FAILURE_COOLDOWN_MS) {
    throw recentFailure.error;
  }

  // Déduplication des requêtes en vol : un appel identique déjà en cours (même
  // zone) est partagé au lieu d'interroger Overpass deux fois — sauf s'il a
  // déjà été annulé (tous ses abonnés sont partis) : on en lance alors une neuve.
  const pending = inFlight.get(key);
  if (pending && !pending.controller.signal.aborted && !options.force) {
    return subscribeToShared(pending, signal);
  }

  const query = buildOverpassQuery(bbox);
  const controller = new AbortController();
  const shared: SharedRequest = {
    controller,
    subscribers: 0,
    done: false,
    promise: Promise.resolve([]),
  };
  shared.promise = (async () => {
    try {
      const elements = await fetchWithRetry(query, controller.signal, options.endpoints ?? OVERPASS_URLS, Boolean(options.force));
      if (controller.signal.aborted) {
        throw new OverpassError('Requête annulée.', 'abort');
      }
      const endpoints = options.endpoints ?? OVERPASS_URLS;
      let allElements = elements;
      let truncated = false;
      if (elements.length >= RESULT_LIMIT) {
        // Limite atteinte : Overpass coupe sans trier par distance, la liste est probablement
        // incomplète. On interroge les 4 quadrants (4 requêtes au plus, séquentielles, une seule
        // fois par zone et par durée de cache). Si tous les quadrants sont complets, l'union l'est ;
        // sinon (quadrant plein, panne, limitation 429) la zone reste signalée comme incomplète.
        truncated = true;
        const merged = [...elements];
        let complete = true;
        for (const quad of splitBbox(bbox)) {
          if (controller.signal.aborted) throw new OverpassError('Requête annulée.', 'abort');
          try {
            const part = await fetchWithRetry(buildOverpassQuery(quad), controller.signal, endpoints, false);
            merged.push(...part);
            if (part.length >= RESULT_LIMIT) complete = false;
          } catch (err) {
            if (err instanceof OverpassError && err.kind === 'abort') throw err;
            complete = false;
            // Serveur qui limite le débit : on ne réinsiste pas, on garde ce qui est déjà récupéré.
            if (err instanceof OverpassError && err.kind === 'rate_limited') break;
          }
        }
        allElements = merged;
        truncated = !complete;
        if (truncated) {
          console.warn(`[osm-poi] Résultats incomplets pour cette zone (limite ${RESULT_LIMIT} par requête).`);
        }
      }
      const pois = dedupePOIs(allElements.map(normalizeElement).filter((p): p is ExternalPOI => p !== null));
      cache.set(key, { at: Date.now(), pois, truncated });
      failures.delete(key);
      return pois;
    } catch (err) {
      if (err instanceof OverpassError && COOLDOWN_KINDS.has(err.kind)) {
        failures.set(key, { at: Date.now(), error: err });
      }
      throw err;
    } finally {
      shared.done = true;
      if (inFlight.get(key) === shared) inFlight.delete(key);
    }
  })();
  // Évite un « unhandled rejection » si tous les abonnés ont déjà abandonné.
  shared.promise.catch(() => {});

  inFlight.set(key, shared);
  return subscribeToShared(shared, signal);
}
