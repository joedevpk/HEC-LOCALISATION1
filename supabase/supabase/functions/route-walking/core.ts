/* ============================================================================
 * core.ts — logique PURE du proxy d'itinéraire piéton (aucun accès réseau,
 * aucune API Deno/Node : testable avec vitest et exécutable dans l'Edge
 * Function Supabase).
 *
 * Rôle : valider la demande du navigateur, construire la requête ORS, classer
 * les échecs d'ORS en erreurs explicites, limiter le débit. La clé ORS n'entre
 * JAMAIS dans ce fichier : index.ts la lit dans les secrets du serveur.
 * ========================================================================= */

export const MAX_STRAIGHT_KM = 25;
export const ORS_URL = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';

/** Zone par défaut : Kinshasa et alentours (lng min, lat min, lng max, lat max). Surchargeable. */
export const DEFAULT_BBOX: Bbox = [14.0, -6.0, 17.0, -3.0];
export type Bbox = [number, number, number, number];

export type ProxyErrorKind =
  | 'invalid_request'
  | 'invalid_points'
  | 'out_of_area'
  | 'too_far'
  | 'no_route'
  | 'rate_limited'
  | 'not_configured'
  | 'service_misconfigured'
  | 'upstream_unavailable'
  | 'timeout'
  | 'bad_request';

export interface ProxyFailure {
  status: number;
  kind: ProxyErrorKind;
  message: string;
  retryAfterSeconds?: number;
}

export type LngLat = [number, number];

const R = 6371000;
export function haversineMeters(a: LngLat, b: LngLat): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function validPoint(p: unknown): p is LngLat {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    typeof p[0] === 'number' &&
    typeof p[1] === 'number' &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    p[0] >= -180 &&
    p[0] <= 180 &&
    p[1] >= -90 &&
    p[1] <= 90 &&
    !(Math.abs(p[0]) < 1e-6 && Math.abs(p[1]) < 1e-6)
  );
}

export function parseBbox(raw: string | undefined | null): Bbox | null {
  if (raw === undefined || raw === null) return DEFAULT_BBOX;
  const t = raw.trim();
  if (t === '' || t.toLowerCase() === 'none') return null; // aucune restriction explicite
  const parts = t.split(',').map((x) => Number(x.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return DEFAULT_BBOX;
  const [w, s, e, n] = parts;
  return w < e && s < n ? [w, s, e, n] : DEFAULT_BBOX;
}

export function inBbox(p: LngLat, bbox: Bbox | null): boolean {
  if (!bbox) return true;
  return p[0] >= bbox[0] && p[0] <= bbox[2] && p[1] >= bbox[1] && p[1] <= bbox[3];
}

export type ValidatedRequest = { ok: true; from: LngLat; to: LngLat } | { ok: false; failure: ProxyFailure };

const fail = (status: number, kind: ProxyErrorKind, message: string): { ok: false; failure: ProxyFailure } => ({
  ok: false,
  failure: { status, kind, message },
});

/** Valide le corps JSON `{ from: [lng,lat], to: [lng,lat] }`. Rien d'autre n'est transmis à ORS. */
export function validateRequest(body: unknown, bbox: Bbox | null = DEFAULT_BBOX): ValidatedRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, 'invalid_request', 'Corps de requête invalide : un objet JSON { from, to } est attendu.');
  }
  const { from, to } = body as { from?: unknown; to?: unknown };
  if (!validPoint(from) || !validPoint(to)) {
    return fail(400, 'invalid_points', 'Coordonnées de départ ou d’arrivée invalides ([longitude, latitude] attendu).');
  }
  if (!inBbox(from, bbox) || !inBbox(to, bbox)) {
    return fail(422, 'out_of_area', 'Départ ou arrivée hors de la zone couverte par ce service d’itinéraire.');
  }
  const d = haversineMeters(from, to);
  if (d < 1) return fail(400, 'invalid_points', 'Le départ et l’arrivée sont identiques.');
  if (d > MAX_STRAIGHT_KM * 1000) {
    return fail(422, 'too_far', `Trajet trop long pour un itinéraire piéton (plus de ${MAX_STRAIGHT_KM} km).`);
  }
  return { ok: true, from, to };
}

/** Corps envoyé à ORS : construit côté serveur, jamais copié depuis le navigateur. */
export function buildOrsBody(from: LngLat, to: LngLat) {
  return { coordinates: [from, to], language: 'fr', instructions: true };
}

function errorInfo(body: unknown): { code?: number | string; message: string } {
  const b = body as { error?: unknown } | null | undefined;
  const e = b?.error;
  if (typeof e === 'string') return { message: e };
  if (e && typeof e === 'object') {
    const eo = e as { code?: unknown; message?: unknown };
    return {
      code: typeof eo.code === 'number' || typeof eo.code === 'string' ? eo.code : undefined,
      message: typeof eo.message === 'string' ? eo.message : '',
    };
  }
  return { message: '' };
}

/**
 * Classe une réponse d'erreur d'ORS. « Aucun chemin » (404 / codes 2009-2010) reste distinct
 * des pannes (clé refusée, quota, indisponibilité, requête mal formée). Le corps d'ORS n'est
 * jamais recopié tel quel vers le navigateur.
 */
export function classifyOrsFailure(status: number, body: unknown, retryAfterHeader?: string | null): ProxyFailure {
  const info = errorInfo(body);
  const msg = info.message.toLowerCase();
  if (status === 401 || status === 403) {
    return {
      status: 502,
      kind: 'service_misconfigured',
      message: 'Le service d’itinéraire est mal configuré côté serveur (clé refusée). Contactez un administrateur.',
    };
  }
  if (status === 429) {
    const ra = Number(retryAfterHeader);
    return {
      status: 429,
      kind: 'rate_limited',
      message: 'Quota du service d’itinéraire atteint : réessayez plus tard.',
      retryAfterSeconds: Number.isFinite(ra) && ra > 0 ? Math.ceil(ra) : 60,
    };
  }
  if (status === 404 || info.code === 2010 || info.code === 2009 || msg.includes('routable point')) {
    return { status: 404, kind: 'no_route', message: 'Aucun chemin piéton cartographié entre ces deux points.' };
  }
  if (info.code === 2004 || msg.includes('exceed')) {
    return { status: 422, kind: 'too_far', message: 'Trajet trop long pour le service d’itinéraire.' };
  }
  if (status === 400) {
    return {
      status: 502,
      kind: 'bad_request',
      message: `Le service d’itinéraire a refusé la requête${info.code !== undefined ? ` (code ${String(info.code)})` : ''}.`,
    };
  }
  return { status: 503, kind: 'upstream_unavailable', message: `Service d’itinéraire indisponible (${status}).` };
}

/**
 * Vérifie qu'une réponse ORS 200 contient bien une géométrie exploitable AVANT de la renvoyer :
 * le proxy ne transmet jamais une réponse vide ou tronquée comme si elle était un itinéraire.
 */
export function validateOrsSuccess(json: unknown): ProxyFailure | null {
  const f = (json as { features?: Array<{ geometry?: { coordinates?: unknown } }> })?.features?.[0];
  const coords = f?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    return { status: 502, kind: 'upstream_unavailable', message: 'Réponse du moteur d’itinéraire invalide (tracé absent).' };
  }
  return null;
}

/** Débit : fenêtre glissante par clé (IP) + plafond global protégeant le quota ORS. */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly perKeyMax: number,
    private readonly globalMax: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now: number): { allowed: true } | { allowed: false; retryAfterSeconds: number; scope: 'client' | 'global' } {
    const cutoff = now - this.windowMs;
    const prune = (k: string) => {
      const arr = (this.hits.get(k) ?? []).filter((t) => t > cutoff);
      this.hits.set(k, arr);
      return arr;
    };
    const mine = prune(key);
    const all = prune('__global__');
    if (mine.length >= this.perKeyMax) {
      return { allowed: false, scope: 'client', retryAfterSeconds: Math.max(1, Math.ceil((mine[0] + this.windowMs - now) / 1000)) };
    }
    if (all.length >= this.globalMax) {
      return { allowed: false, scope: 'global', retryAfterSeconds: Math.max(1, Math.ceil((all[0] + this.windowMs - now) / 1000)) };
    }
    mine.push(now);
    all.push(now);
    // Évite la croissance illimitée de la table.
    if (this.hits.size > 5000) {
      for (const k of [...this.hits.keys()]) if (prune(k).length === 0) this.hits.delete(k);
    }
    return { allowed: true };
  }
}

/** Origine de production toujours autorisée, même si le secret ALLOWED_ORIGINS est absent ou incomplet. */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = ['https://localisationhec.onrender.com'];

/** Normalise une origine : espaces, slash final et casse (une origine navigateur n'a jamais de chemin). */
export function normalizeOrigin(o: string): string {
  return o.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * Origines autorisées (CORS) = origine de production par défaut + liste ALLOWED_ORIGINS (séparée par des
 * virgules). '*' n'est jamais accepté. Renvoie l'origine de la requête si elle est autorisée, sinon null.
 */
export function corsOriginFor(requestOrigin: string | null, allowedCsv: string | undefined): string | null {
  if (!requestOrigin) return null;
  const list = [...DEFAULT_ALLOWED_ORIGINS, ...(allowedCsv ?? '').split(',')]
    .map(normalizeOrigin)
    .filter((o) => o !== '' && o !== '*');
  return list.includes(normalizeOrigin(requestOrigin)) ? requestOrigin : null;
}

/** Taille maximale acceptée pour le corps de la requête (deux coordonnées tiennent en ~100 octets). */
export const MAX_BODY_BYTES = 2048;

/**
 * Identifiant du client pour la limitation de débit.
 * `cf-connecting-ip` est posé par l'infrastructure (le client ne peut pas le choisir) ; on le préfère donc
 * à `x-forwarded-for`, dont la première valeur peut être fournie par le client. À défaut, on retombe sur
 * `x-real-ip` puis sur `x-forwarded-for`. La limite GLOBALE reste le filet de sécurité si l'en-tête est falsifié.
 */
export function clientKey(headers: { get(name: string): string | null }): string {
  const pick = (name: string) => (headers.get(name) ?? '').split(',')[0].trim();
  const raw = pick('cf-connecting-ip') || pick('x-real-ip') || pick('x-forwarded-for');
  return raw ? raw.slice(0, 64) : 'unknown';
}

/** Lit un corps JSON borné. Renvoie null si trop gros ou illisible (kind distingue les deux cas). */
export async function readBoundedJson(
  req: { headers: { get(name: string): string | null }; text(): Promise<string> },
  maxBytes: number = MAX_BODY_BYTES,
): Promise<{ ok: true; body: unknown } | { ok: false; kind: 'too_large' | 'unreadable' }> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, kind: 'too_large' };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, kind: 'unreadable' };
  }
  if (new TextEncoder().encode(text).length > maxBytes) return { ok: false, kind: 'too_large' };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, kind: 'unreadable' };
  }
}
