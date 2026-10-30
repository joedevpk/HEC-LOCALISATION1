// Gestionnaire HTTP de « route-walking », séparé de Deno.serve pour être testable.
// Ordre voulu : CORS (toujours) → préflight OPTIONS (jamais bloqué) → origine → méthode → métier.
// Le JWT est vérifié par la passerelle Supabase (verify_jwt = true) pour les requêtes POST réelles.
import {
  ORS_URL,
  SlidingWindowLimiter,
  buildOrsBody,
  classifyOrsFailure,
  clientKey,
  corsOriginFor,
  parseBbox,
  readBoundedJson,
  validateOrsSuccess,
  validateRequest,
  type ProxyFailure,
} from './core.ts';

export interface HandlerDeps {
  env: { get(name: string): string | undefined };
  fetchImpl: typeof fetch;
  limiter?: SlidingWindowLimiter;
  now?: () => number;
  upstreamTimeoutMs?: number;
}

export const ALLOWED_REQUEST_HEADERS =
  'authorization, apikey, content-type, x-client-info, x-supabase-api-version';

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

function failure(f: ProxyFailure, headers: Record<string, string>): Response {
  const h = { ...headers };
  if (f.retryAfterSeconds) h['Retry-After'] = String(f.retryAfterSeconds);
  return json({ error: { kind: f.kind, message: f.message } }, f.status, h);
}

export function createHandler(deps: HandlerDeps) {
  const { env, fetchImpl } = deps;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.upstreamTimeoutMs ?? 12_000;
  const limiter =
    deps.limiter ??
    new SlidingWindowLimiter(
      Number(env.get('ROUTING_RATE_PER_IP_PER_MIN')) || 20,
      Number(env.get('ROUTING_RATE_GLOBAL_PER_MIN')) || 35, // plan gratuit ORS : 40 requêtes/min
      60_000,
    );

  return async function handle(req: Request): Promise<Response> {
    // 1) En-têtes CORS calculés en tout premier : ils s'appliquent à TOUTES les réponses ci-dessous.
    const allowed = corsOriginFor(req.headers.get('origin'), env.get('ALLOWED_ORIGINS'));
    const cors: Record<string, string> = {
      Vary: 'Origin',
      'Access-Control-Allow-Headers': ALLOWED_REQUEST_HEADERS,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Expose-Headers': 'Retry-After',
    };
    if (allowed) cors['Access-Control-Allow-Origin'] = allowed;

    // 2) Préflight : toujours un statut 2xx (sinon le navigateur annonce « does not have HTTP ok status »).
    //    Sans origine autorisée, pas d'Access-Control-Allow-Origin : le navigateur refuse proprement.
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (!allowed) {
        return failure({ status: 403, kind: 'service_misconfigured', message: 'Origine non autorisée.' }, cors);
      }
      if (req.method !== 'POST') {
        return failure({ status: 405, kind: 'invalid_request', message: 'Méthode non autorisée.' }, cors);
      }

      const apiKey = env.get('ORS_API_KEY');
      if (!apiKey) {
        return failure(
          { status: 503, kind: 'not_configured', message: 'Le service d’itinéraire n’est pas configuré sur le serveur.' },
          cors,
        );
      }

      const parsed = await readBoundedJson(req);
      if (!parsed.ok) {
        return parsed.kind === 'too_large'
          ? failure({ status: 413, kind: 'invalid_request', message: 'Requête trop volumineuse.' }, cors)
          : failure({ status: 400, kind: 'invalid_request', message: 'Corps JSON illisible.' }, cors);
      }
      const v = validateRequest(parsed.body, parseBbox(env.get('ROUTING_ALLOWED_BBOX')));
      if (!v.ok) return failure(v.failure, cors);

      const gate = limiter.check(clientKey(req.headers), now());
      if (!gate.allowed) {
        return failure(
          {
            status: 429,
            kind: 'rate_limited',
            message:
              gate.scope === 'global'
                ? 'Le service d’itinéraire est très sollicité : réessayez dans un instant.'
                : 'Trop de calculs d’itinéraire : réessayez dans un instant.',
            retryAfterSeconds: gate.retryAfterSeconds,
          },
          cors,
        );
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(ORS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json', Authorization: apiKey },
          body: JSON.stringify(buildOrsBody(v.from, v.to)),
          signal: controller.signal,
        });
        let payload: unknown;
        try {
          payload = await res.json();
        } catch {
          payload = undefined;
        }
        if (!res.ok) return failure(classifyOrsFailure(res.status, payload, res.headers.get('retry-after')), cors);
        const bad = validateOrsSuccess(payload);
        if (bad) return failure(bad, cors);
        return json(payload, 200, cors);
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === 'AbortError';
        return failure(
          aborted
            ? { status: 504, kind: 'timeout', message: 'Le moteur d’itinéraire ne répond pas (délai dépassé).' }
            : { status: 503, kind: 'upstream_unavailable', message: 'Moteur d’itinéraire injoignable.' },
          cors,
        );
      } finally {
        clearTimeout(timer);
      }
    } catch (_e) {
      // Filet de sécurité : une erreur imprévue garde les en-têtes CORS (le navigateur voit un 500 lisible,
      // pas une erreur CORS opaque). Aucun détail interne n'est renvoyé.
      return failure({ status: 500, kind: 'upstream_unavailable', message: 'Erreur interne du service d’itinéraire.' }, cors);
    }
  };
}
