/* ============================================================================
 * geocoding.ts — recherche géographique RÉELLE (rues, établissements, lieux).
 *
 * Fournisseurs (choisis par variables d'environnement, jamais mélangés) :
 *  - 'maptiler'  : API Geocoding de MapTiler, avec la MÊME clé que la carte
 *                  (VITE_MAP_API_KEY) quand VITE_MAP_PROVIDER=maptiler.
 *                  Autorise l'autocomplétion (suggestions pendant la frappe).
 *  - 'nominatim' : service public OpenStreetMap. Sa politique d'usage INTERDIT
 *                  l'autocomplétion et limite à 1 requête/seconde : la
 *                  recherche ne part donc que sur validation explicite
 *                  (Entrée / bouton). À n'utiliser que pour un faible trafic.
 *  - 'none'      : aucune recherche géographique (message explicite en UI).
 * VITE_GEOCODER force le choix ; sans lui : maptiler si carte MapTiler + clé,
 * sinon 'none'. Aucun résultat n'est jamais fabriqué : en cas d'échec une
 * GeocodeError est levée.
 * ========================================================================= */
import { isNullIsland, isValidCoordinates } from '@/lib/geo-validation';

export type GeocoderProvider = 'maptiler' | 'nominatim' | 'none';

export interface PlaceResult {
  id: string;
  name: string;
  /** Libellé complet (adresse / contexte) tel que renvoyé par le fournisseur. */
  label: string;
  lng: number;
  lat: number;
  source: 'maptiler' | 'nominatim';
  /**
   * Précision du point renvoyé. « approximate » = quartier, commune, rue entière, ville… : le point
   * est un centre représentatif, pas une entrée réelle. Absent = non déterminée (jamais présumée précise).
   */
  precision?: 'precise' | 'approximate';
}

const MAPTILER_PRECISE_TYPES = new Set(['address', 'poi']);
const NOMINATIM_PRECISE_CLASSES = new Set([
  'building', 'amenity', 'shop', 'office', 'tourism', 'leisure', 'healthcare', 'craft', 'historic', 'man_made',
]);

/** Précision d'un résultat MapTiler à partir de ses `place_type` (ou undefined si absent). */
export function maptilerPrecision(placeType: unknown): PlaceResult['precision'] {
  if (!Array.isArray(placeType) || placeType.length === 0) return undefined;
  return placeType.some((t) => typeof t === 'string' && MAPTILER_PRECISE_TYPES.has(t)) ? 'precise' : 'approximate';
}

/** Précision d'un résultat Nominatim à partir de `class` / `addresstype` (ou undefined). */
export function nominatimPrecision(cls: unknown, addresstype: unknown): PlaceResult['precision'] {
  if (typeof cls !== 'string' && typeof addresstype !== 'string') return undefined;
  if (addresstype === 'house' || addresstype === 'building') return 'precise';
  return typeof cls === 'string' && NOMINATIM_PRECISE_CLASSES.has(cls) ? 'precise' : 'approximate';
}

export type GeocodeErrorKind =
  | 'not_configured'
  | 'abort'
  | 'timeout'
  | 'forbidden'
  | 'rate_limited'
  | 'network_error'
  | 'invalid_response';

export class GeocodeError extends Error {
  constructor(
    message: string,
    public readonly kind: GeocodeErrorKind,
  ) {
    super(message);
    this.name = 'GeocodeError';
  }
}

type EnvLike = Record<string, unknown>;

export interface GeocoderConfig {
  provider: GeocoderProvider;
  /** Vrai si des suggestions peuvent être demandées pendant la frappe. */
  autocomplete: boolean;
  apiKey?: string;
}

export function resolveGeocoder(env: EnvLike = import.meta.env as EnvLike): GeocoderConfig {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const forced = str(env.VITE_GEOCODER).toLowerCase();
  const key = str(env.VITE_MAP_API_KEY);
  const mapProvider = str(env.VITE_MAP_PROVIDER).toLowerCase();

  if (forced === 'none') return { provider: 'none', autocomplete: false };
  if (forced === 'nominatim') return { provider: 'nominatim', autocomplete: false };
  if ((forced === 'maptiler' || (!forced && mapProvider === 'maptiler')) && key) {
    return { provider: 'maptiler', autocomplete: true, apiKey: key };
  }
  return { provider: 'none', autocomplete: false };
}

export const MIN_QUERY_LENGTH = 3;
const TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const RESULT_LIMIT = 6;
const NOMINATIM_MIN_INTERVAL_MS = 1_100;

const CACHE_MAX_ENTRIES = 100;
const cache = new Map<string, { at: number; results: PlaceResult[] }>();
let lastNominatimCall = 0;
/** File d'attente unique : les appels Nominatim sont strictement espacés (1 req/s max). */
let nominatimQueue: Promise<void> = Promise.resolve();

export function resetGeocodeCache(): void {
  cache.clear();
  lastNominatimCall = 0;
  nominatimQueue = Promise.resolve();
}

/** Cache borné (la saisie rapide ne doit pas faire grossir la mémoire sans limite). */
function setCache(key: string, results: PlaceResult[]): void {
  cache.set(key, { at: Date.now(), results });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Réserve un créneau Nominatim. Les appels simultanés sont SÉRIALISÉS : avant
 * correction, deux recherches lancées en même temps calculaient la même attente
 * et partaient ensemble, ce qui enfreint la limite d'1 requête/seconde de la
 * politique d'usage. Un appel annulé pendant l'attente ne consomme pas de créneau.
 */
function acquireNominatimSlot(signal?: AbortSignal): Promise<void> {
  const previous = nominatimQueue;
  let release!: () => void;
  nominatimQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  return previous.then(async () => {
    try {
      const wait = lastNominatimCall + NOMINATIM_MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      if (signal?.aborted) throw new GeocodeError('Recherche annulée.', 'abort');
      lastNominatimCall = Date.now();
    } finally {
      release();
    }
  });
}

export function normalizeQuery(q: string): string {
  return q.replace(/\s+/g, ' ').trim();
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Parse défensif d'une réponse MapTiler Geocoding (GeoJSON FeatureCollection). */
export function parseMapTiler(json: unknown): PlaceResult[] {
  const features = (json as { features?: unknown })?.features;
  if (!Array.isArray(features)) throw new GeocodeError('Réponse de recherche inattendue.', 'invalid_response');
  const out: PlaceResult[] = [];
  const seen = new Set<string>();
  for (const f of features as Array<Record<string, unknown>>) {
    const center = (f.center ?? (f.geometry as { coordinates?: unknown } | undefined)?.coordinates) as unknown;
    if (!Array.isArray(center) || center.length < 2) continue;
    const [lng, lat] = center as [number, number];
    if (!isValidCoordinates(lat, lng) || isNullIsland(lat, lng)) continue;
    const text = typeof f.text === 'string' ? f.text : '';
    const label = typeof f.place_name === 'string' ? f.place_name : text;
    const name = (text || label.split(',')[0] || '').trim();
    if (!name) continue;
    const id = `mt:${String(f.id ?? `${lng},${lat}`)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const precision = maptilerPrecision(f.place_type);
    out.push(precision ? { id, name, label, lng, lat, source: 'maptiler', precision } : { id, name, label, lng, lat, source: 'maptiler' });
  }
  return out.slice(0, RESULT_LIMIT);
}

/** Parse défensif d'une réponse Nominatim (format jsonv2). */
export function parseNominatim(json: unknown): PlaceResult[] {
  if (!Array.isArray(json)) throw new GeocodeError('Réponse de recherche inattendue.', 'invalid_response');
  const out: PlaceResult[] = [];
  const seen = new Set<string>();
  for (const it of json as Array<Record<string, unknown>>) {
    const lat = Number(it.lat);
    const lng = Number(it.lon);
    if (!isValidCoordinates(lat, lng) || isNullIsland(lat, lng)) continue;
    const label = typeof it.display_name === 'string' ? it.display_name : '';
    const name = (typeof it.name === 'string' && it.name ? it.name : label.split(',')[0] || '').trim();
    if (!name) continue;
    const id = `nom:${String(it.osm_type ?? 'x')}/${String(it.osm_id ?? it.place_id ?? `${lng},${lat}`)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const precision = nominatimPrecision(it.class, it.addresstype);
    out.push(
      precision
        ? { id, name, label: label || name, lng, lat, source: 'nominatim', precision }
        : { id, name, label: label || name, lng, lat, source: 'nominatim' },
    );
  }
  return out.slice(0, RESULT_LIMIT);
}

export interface SearchPlacesOptions {
  /** Centre de biais (ex. le campus) : classe les résultats proches en premier. */
  proximity?: [number, number];
  signal?: AbortSignal;
  config?: GeocoderConfig;
}

export async function searchPlaces(rawQuery: string, opts: SearchPlacesOptions = {}): Promise<PlaceResult[]> {
  const config = opts.config ?? resolveGeocoder();
  if (config.provider === 'none') {
    throw new GeocodeError(
      "La recherche de lieux n'est pas configurée (clé de carte ou VITE_GEOCODER manquant).",
      'not_configured',
    );
  }
  const query = normalizeQuery(rawQuery);
  if (query.length < MIN_QUERY_LENGTH) return [];

  // Biais de proximité : jamais envoyé s'il est invalide (« NaN,NaN » serait refusé ou ignoré).
  const prox =
    opts.proximity && isValidCoordinates(opts.proximity[1], opts.proximity[0])
      ? opts.proximity.map((n) => n.toFixed(3)).join(',')
      : '';
  const key = `${config.provider}|${query.toLowerCase()}|${prox}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;

  let url: string;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.provider === 'maptiler') {
    const p = new URLSearchParams({ key: config.apiKey ?? '', language: 'fr', country: 'cd', limit: String(RESULT_LIMIT), autocomplete: 'true' });
    if (prox) p.set('proximity', prox);
    url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${p.toString()}`;
  } else {
    const p = new URLSearchParams({ q: query, format: 'jsonv2', limit: String(RESULT_LIMIT), countrycodes: 'cd', 'accept-language': 'fr' });
    url = `https://nominatim.openstreetmap.org/search?${p.toString()}`;
    await acquireNominatimSlot(opts.signal);
  }

  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort);
  if (opts.signal?.aborted) controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
    if (opts.signal?.aborted) throw new GeocodeError('Recherche annulée.', 'abort');
    if (timedOut) throw new GeocodeError('Le service de recherche de lieux ne répond pas (délai dépassé).', 'timeout');
    void err;
    throw new GeocodeError('Impossible de contacter le service de recherche de lieux. Vérifiez votre connexion.', 'network_error');
  }

  // Le délai reste armé pendant la lecture du corps (un corps qui n'arrive
  // jamais ne doit pas laisser la recherche en « chargement » indéfiniment).
  try {
    if (res.status === 401 || res.status === 403) {
      throw new GeocodeError('Accès refusé par le service de recherche (clé ou restriction de domaine).', 'forbidden');
    }
    if (res.status === 429) throw new GeocodeError('Trop de recherches : réessayez dans un instant.', 'rate_limited');
    if (!res.ok) throw new GeocodeError(`Service de recherche indisponible (${res.status}).`, 'network_error');

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      if (opts.signal?.aborted) throw new GeocodeError('Recherche annulée.', 'abort');
      if (timedOut) throw new GeocodeError('Le service de recherche de lieux ne répond pas (délai dépassé).', 'timeout');
      throw new GeocodeError('Réponse de recherche illisible.', 'invalid_response');
    }
    const results = config.provider === 'maptiler' ? parseMapTiler(json) : parseNominatim(json);
    setCache(key, results);
    return results;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
