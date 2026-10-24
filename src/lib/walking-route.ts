/* ============================================================================
 * walking-route.ts — itinéraire PIÉTON hors du réseau interne du campus, via un
 * vrai moteur de routage (OpenStreetMap). Le tracé suit des chemins/routes
 * réels renvoyés par le moteur ; jamais de ligne droite déguisée.
 *
 * Moteurs pris en charge (choisis par variables d'environnement) :
 *  - 'ors'  : openrouteservice, profil `foot-walking`
 *             VITE_ROUTING_API_KEY requise (clé visible dans le navigateur :
 *             à restreindre par domaine ; quotas du plan gratuit limités).
 *  - 'osrm' : instance OSRM à vous, profil `foot`
 *             VITE_ROUTING_URL = base de l'instance. ATTENTION : le serveur
 *             de démonstration public d'OSRM ne propose que la voiture et
 *             interdit un usage de production : ne pas le configurer ici.
 *  - 'none' (défaut) : non configuré → l'UI l'indique honnêtement.
 * ========================================================================= */
import { haversine, type RouteResult } from '@/lib/nav';
import { isNullIsland, isValidCoordinates } from '@/lib/geo-validation';

export type WalkingRouterProvider = 'ors' | 'osrm' | 'none';

export type WalkingRouteErrorKind =
  | 'not_configured'
  | 'invalid_points'
  | 'too_far'
  | 'no_route'
  | 'forbidden'
  | 'rate_limited'
  | 'timeout'
  | 'abort'
  | 'network_error'
  /** Requête refusée comme mal formée par le moteur (≠ « aucun chemin ») : erreur de configuration/intégration. */
  | 'bad_request'
  | 'invalid_response';

export class WalkingRouteError extends Error {
  constructor(
    message: string,
    public readonly kind: WalkingRouteErrorKind,
  ) {
    super(message);
    this.name = 'WalkingRouteError';
  }
}

type EnvLike = Record<string, unknown>;

export interface WalkingRouterConfig {
  provider: WalkingRouterProvider;
  apiKey?: string;
  baseUrl?: string;
}

export function resolveWalkingRouter(env: EnvLike = import.meta.env as EnvLike): WalkingRouterConfig {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const p = str(env.VITE_ROUTING_PROVIDER).toLowerCase();
  if (p === 'ors' && str(env.VITE_ROUTING_API_KEY)) {
    return { provider: 'ors', apiKey: str(env.VITE_ROUTING_API_KEY) };
  }
  if (p === 'osrm' && /^https?:\/\//i.test(str(env.VITE_ROUTING_URL))) {
    return { provider: 'osrm', baseUrl: str(env.VITE_ROUTING_URL).replace(/\/+$/, '') };
  }
  return { provider: 'none' };
}

export function isWalkingRouterConfigured(config: WalkingRouterConfig = resolveWalkingRouter()): boolean {
  return config.provider !== 'none';
}

const TIMEOUT_MS = 15_000;
/** Au-delà, ce n'est plus un trajet piéton raisonnable (évite des requêtes absurdes). */
export const MAX_WALK_STRAIGHT_KM = 25;

const PROVIDER_LABEL: Record<Exclude<WalkingRouterProvider, 'none'>, string> = {
  ors: 'openrouteservice (OpenStreetMap)',
  osrm: 'OSRM (OpenStreetMap)',
};

const OSRM_TURN: Record<string, string> = {
  left: 'Tournez à gauche',
  right: 'Tournez à droite',
  'slight left': 'Tournez légèrement à gauche',
  'slight right': 'Tournez légèrement à droite',
  'sharp left': 'Tournez franchement à gauche',
  'sharp right': 'Tournez franchement à droite',
  uturn: 'Faites demi-tour',
};

function validLine(coords: unknown): [number, number][] {
  if (!Array.isArray(coords) || coords.length < 2) {
    throw new WalkingRouteError('Tracé d’itinéraire absent de la réponse.', 'invalid_response');
  }
  const line: [number, number][] = [];
  for (const c of coords as unknown[]) {
    if (!Array.isArray(c) || !isValidCoordinates(c[1], c[0]) || isNullIsland(c[1] as number, c[0] as number)) {
      throw new WalkingRouteError('Tracé d’itinéraire invalide dans la réponse.', 'invalid_response');
    }
    line.push([c[0] as number, c[1] as number]);
  }
  return line;
}

/** Un moteur « accroche » le départ/l'arrivée au chemin le plus proche. Si ce chemin
 * est à plus de 1 km du point demandé, le tracé ne représente pas le trajet voulu :
 * mieux vaut une erreur claire qu'un itinéraire qui commence ailleurs. */
export const MAX_SNAP_DISTANCE_M = 1000;

export interface RouteRequestPoints {
  from: [number, number];
  to: [number, number];
}

function assertEndpointsNearRequest(line: [number, number][], req: RouteRequestPoints | undefined): void {
  if (!req) return;
  const startGap = haversine(req.from, line[0]);
  const endGap = haversine(req.to, line[line.length - 1]);
  if (startGap > MAX_SNAP_DISTANCE_M || endGap > MAX_SNAP_DISTANCE_M) {
    throw new WalkingRouteError(
      "Aucun chemin piéton cartographié à moins d'un kilomètre du départ ou de l'arrivée : le tracé ne serait pas fiable.",
      'no_route',
    );
  }
}

function finish(
  provider: Exclude<WalkingRouterProvider, 'none'>,
  coordinates: [number, number][],
  distanceMeters: unknown,
  durationSeconds: unknown,
  steps: string[],
  req?: RouteRequestPoints,
): RouteResult {
  const dist = Number(distanceMeters);
  const dur = Number(durationSeconds);
  if (!Number.isFinite(dist) || dist < 0 || !Number.isFinite(dur) || dur < 0) {
    throw new WalkingRouteError('Distance ou durée invalide dans la réponse.', 'invalid_response');
  }
  assertEndpointsNearRequest(coordinates, req);
  return {
    coordinates,
    distanceMeters: dist,
    durationMinutes: Math.max(1, Math.round(dur / 60)),
    steps,
    usedNetwork: true,
    source: 'external',
    provider: PROVIDER_LABEL[provider],
  };
}

export function parseOrs(json: unknown, req?: RouteRequestPoints): RouteResult {
  const f = (json as { features?: Array<Record<string, unknown>> })?.features?.[0];
  if (!f) throw new WalkingRouteError('Aucun itinéraire dans la réponse.', 'no_route');
  const coords = validLine((f.geometry as { coordinates?: unknown } | undefined)?.coordinates);
  const props = (f.properties ?? {}) as { summary?: { distance?: unknown; duration?: unknown }; segments?: Array<{ steps?: Array<{ instruction?: unknown }> }> };
  const steps = (props.segments ?? [])
    .flatMap((s) => s.steps ?? [])
    .map((s) => (typeof s.instruction === 'string' ? s.instruction : ''))
    .filter(Boolean);
  return finish('ors', coords, props.summary?.distance, props.summary?.duration, steps, req);
}

export function parseOsrm(json: unknown, req?: RouteRequestPoints): RouteResult {
  const body = json as { code?: string; routes?: Array<Record<string, unknown>> };
  if (body?.code && body.code !== 'Ok') {
    // NoRoute / NoSegment : vrai « aucun chemin ». Autres codes (InvalidQuery,
    // InvalidUrl, TooBig…) : requête refusée, ce n'est PAS une absence de chemin.
    if (body.code === 'NoRoute' || body.code === 'NoSegment') {
      throw new WalkingRouteError('Aucun chemin piéton trouvé entre ces deux points.', 'no_route');
    }
    throw new WalkingRouteError(`Le serveur d'itinéraire a refusé la requête (${String(body.code)}).`, 'bad_request');
  }
  const r = body?.routes?.[0];
  if (!r) throw new WalkingRouteError('Aucun itinéraire dans la réponse.', 'no_route');
  const coords = validLine((r.geometry as { coordinates?: unknown } | undefined)?.coordinates);
  const legs = (r.legs ?? []) as Array<{ steps?: Array<{ name?: string; distance?: number; maneuver?: { type?: string; modifier?: string } }> }>;
  const steps = legs
    .flatMap((l) => l.steps ?? [])
    .map((st) => {
      const type = st.maneuver?.type;
      if (type === 'arrive') return 'Vous êtes arrivé.';
      const base = type === 'depart' ? 'Partez' : OSRM_TURN[st.maneuver?.modifier ?? ''] ?? 'Continuez';
      const road = st.name ? ` sur ${st.name}` : '';
      const d = typeof st.distance === 'number' ? ` (${Math.round(st.distance)} m)` : '';
      return `${base}${road}${d}`;
    });
  return finish('osrm', coords, r.distance, r.duration, steps, req);
}

export async function fetchWalkingRoute(
  from: [number, number],
  to: [number, number],
  opts: { signal?: AbortSignal; config?: WalkingRouterConfig } = {},
): Promise<RouteResult> {
  const config = opts.config ?? resolveWalkingRouter();
  if (config.provider === 'none') {
    throw new WalkingRouteError("Le calcul d'itinéraire piéton hors campus n'est pas configuré.", 'not_configured');
  }
  if (!isValidCoordinates(from[1], from[0]) || !isValidCoordinates(to[1], to[0])) {
    throw new WalkingRouteError('Coordonnées de départ ou d’arrivée invalides.', 'invalid_points');
  }
  if (haversine(from, to) > MAX_WALK_STRAIGHT_KM * 1000) {
    throw new WalkingRouteError(`Trajet trop long pour un itinéraire piéton (plus de ${MAX_WALK_STRAIGHT_KM} km).`, 'too_far');
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
    if (config.provider === 'ors') {
      res = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json', Authorization: config.apiKey ?? '' },
        body: JSON.stringify({ coordinates: [from, to], language: 'fr', instructions: true }),
        signal: controller.signal,
      });
    } else {
      const pts = `${from[0]},${from[1]};${to[0]},${to[1]}`;
      res = await fetch(`${config.baseUrl}/route/v1/foot/${pts}?overview=full&geometries=geojson&steps=true`, {
        signal: controller.signal,
      });
    }
  } catch {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
    if (opts.signal?.aborted) throw new WalkingRouteError('Calcul annulé.', 'abort');
    if (timedOut) throw new WalkingRouteError("Le service d'itinéraire ne répond pas (délai dépassé).", 'timeout');
    throw new WalkingRouteError("Impossible de contacter le service d'itinéraire. Vérifiez votre connexion.", 'network_error');
  }

  // Le délai reste armé pendant la lecture du corps (réponse ou message d'erreur).
  try {
    const readJson = async (): Promise<unknown> => {
      try {
        return await res.json();
      } catch {
        if (opts.signal?.aborted) throw new WalkingRouteError('Calcul annulé.', 'abort');
        if (timedOut) throw new WalkingRouteError("Le service d'itinéraire ne répond pas (délai dépassé).", 'timeout');
        return undefined;
      }
    };

    if (!res.ok) {
      throw classifyRoutingFailure(config.provider, res.status, await readJson());
    }

    const json = await readJson();
    if (json === undefined) {
      throw new WalkingRouteError('Réponse du service d’itinéraire illisible.', 'invalid_response');
    }
    const req: RouteRequestPoints = { from, to };
    return config.provider === 'ors' ? parseOrs(json, req) : parseOsrm(json, req);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

/** Corps d'erreur ORS : { error: { code, message } } (ou chaîne) ; OSRM : { code, message }. */
function errorInfo(body: unknown): { code?: number | string; message: string } {
  const b = body as { error?: unknown; code?: unknown; message?: unknown } | null | undefined;
  const e = b?.error;
  if (typeof e === 'string') return { message: e };
  if (e && typeof e === 'object') {
    const eo = e as { code?: unknown; message?: unknown };
    return {
      code: typeof eo.code === 'number' || typeof eo.code === 'string' ? eo.code : undefined,
      message: typeof eo.message === 'string' ? eo.message : '',
    };
  }
  return {
    code: typeof b?.code === 'number' || typeof b?.code === 'string' ? b.code : undefined,
    message: typeof b?.message === 'string' ? b.message : '',
  };
}

/**
 * Traduit une réponse HTTP d'erreur en erreur explicite. Distinction essentielle :
 * « aucun chemin » (la requête est valide, le trajet n'existe pas) ≠ « requête
 * refusée » (configuration/intégration à corriger). Avant correction, tout 400 était
 * présenté à l'utilisateur comme « aucun chemin », ce qui masquait les vraies pannes.
 */
export function classifyRoutingFailure(
  provider: Exclude<WalkingRouterProvider, 'none'>,
  status: number,
  body: unknown,
): WalkingRouteError {
  if (status === 401 || status === 403) {
    return new WalkingRouteError("Accès refusé par le service d'itinéraire (clé ou restriction de domaine).", 'forbidden');
  }
  if (status === 429) {
    return new WalkingRouteError("Quota du service d'itinéraire atteint : réessayez plus tard.", 'rate_limited');
  }
  const info = errorInfo(body);
  const msg = info.message.toLowerCase();
  const noRoute = () => new WalkingRouteError('Aucun chemin piéton trouvé entre ces deux points.', 'no_route');

  if (provider === 'ors') {
    // 404 + code 2010 : « Could not find routable point within a radius of 350 m ».
    if (status === 404 || info.code === 2010 || info.code === 2009 || msg.includes('routable point')) return noRoute();
    if (info.code === 2004 || msg.includes('exceed')) {
      return new WalkingRouteError("Trajet trop long pour le service d'itinéraire.", 'too_far');
    }
    if (status === 400) {
      return new WalkingRouteError(
        `Le service d'itinéraire a refusé la requête${info.code !== undefined ? ` (code ${String(info.code)})` : ''}. Contactez un administrateur.`,
        'bad_request',
      );
    }
  } else {
    if (info.code === 'NoRoute' || info.code === 'NoSegment') return noRoute();
    if (status === 400) {
      return new WalkingRouteError(
        `Le serveur d'itinéraire a refusé la requête${info.code !== undefined ? ` (${String(info.code)})` : ''}. Contactez un administrateur.`,
        'bad_request',
      );
    }
    if (status === 404) {
      return new WalkingRouteError(
        "Serveur d'itinéraire introuvable (404) : vérifiez VITE_ROUTING_URL.",
        'network_error',
      );
    }
  }
  return new WalkingRouteError(`Service d'itinéraire indisponible (${status}).`, 'network_error');
}

export interface ExternalRouteMarker {
  destId: string;
  origin: [number, number];
}

/**
 * Faut-il conserver le calcul externe déjà affiché OU déjà en cours au lieu d'en relancer un ?
 * Oui si la destination est la même et que le départ a bougé de moins de `minMoveM` mètres
 * (bruit GPS). Avant correction, seul un calcul TERMINÉ était pris en compte : tant qu'une
 * requête était en vol, chaque micro-déplacement l'annulait et la relançait (clignotement,
 * quota du moteur gaspillé, tracé qui n'arrive jamais).
 */
export function shouldKeepExternalRoute(args: {
  last: ExternalRouteMarker | null;
  pending: ExternalRouteMarker | null;
  destId: string;
  from: [number, number];
  minMoveM: number;
}): boolean {
  const same = (m: ExternalRouteMarker | null) =>
    m !== null && m.destId === args.destId && haversine(m.origin, args.from) < args.minMoveM;
  return same(args.pending) || same(args.last);
}
