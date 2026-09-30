// ---------------------------------------------------------------------
// Journal d'erreurs centralisé (PHASE 6, règle 18).
//
// - Un SEUL point d'entrée : logError() / logWarn().
// - Conserve, pour chaque erreur importante : horodatage, route,
//   type, message et un contexte NON sensible.
// - Ne journalise JAMAIS de mot de passe, jeton, clé ou donnée sensible :
//   les clés de contexte suspectes sont masquées et les valeurs qui
//   ressemblent à un jeton (JWT, longue chaîne opaque) sont écartées.
// - Aucun fournisseur de monitoring n'est obligatoire : si
//   VITE_LOG_ENDPOINT est défini (n'importe quel collecteur HTTP :
//   Sentry tunnel, Logtail, fonction Edge Supabase...), les erreurs
//   critiques y sont envoyées via sendBeacon ; sinon elles restent dans
//   la console et dans le tampon mémoire (getRecentErrors) affiché dans
//   le panneau de diagnostic administrateur.
// ---------------------------------------------------------------------

export type LogLevel = 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  route: string;
  type: string;
  message: string;
  context?: Record<string, string | number | boolean | null>;
}

const MAX_BUFFER = 50;
const buffer: LogEntry[] = [];
// Anti-boucle : la même erreur n'est envoyée qu'une fois par fenêtre.
const recentKeys = new Map<string, number>();
const DEDUPE_WINDOW_MS = 30_000;
let sentCount = 0;
const MAX_SENT_PER_SESSION = 30;

const SENSITIVE_KEY = /pass(word)?|token|secret|key|authorization|cookie|session|jwt|email|phone/i;
const TOKEN_LIKE = /^(eyJ[\w-]+\.[\w-]+\.[\w-]+|[A-Za-z0-9_-]{40,})$/;

function currentRoute(): string {
  if (typeof window === 'undefined') return '';
  // Le routeur de l'app est basé sur le hash (#/map?...) : on retire la
  // query pour ne jamais journaliser un identifiant ou un code QR.
  const hash = window.location.hash.replace(/^#/, '') || window.location.pathname;
  return hash.split('?')[0];
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jeton masqué]')
    .replace(/(apikey|api_key|access_token|key)=([^&\s]+)/gi, '$1=[masqué]')
    .slice(0, 500);
}

function sanitizeContext(
  context?: Record<string, unknown>,
): LogEntry['context'] | undefined {
  if (!context) return undefined;
  const out: NonNullable<LogEntry['context']> = {};
  for (const [k, v] of Object.entries(context)) {
    if (SENSITIVE_KEY.test(k)) continue;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v as number | boolean | null;
    } else if (typeof v === 'string') {
      if (TOKEN_LIKE.test(v)) continue;
      out[k] = sanitizeMessage(v).slice(0, 200);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function push(entry: LogEntry) {
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
}

function forward(entry: LogEntry) {
  const endpoint = import.meta.env.VITE_LOG_ENDPOINT as string | undefined;
  if (!endpoint || entry.level !== 'error') return;
  if (sentCount >= MAX_SENT_PER_SESSION) return;
  const key = `${entry.type}|${entry.message}|${entry.route}`;
  const now = Date.now();
  const last = recentKeys.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return;
  recentKeys.set(key, now);
  sentCount += 1;
  try {
    const body = JSON.stringify(entry);
    if (navigator.sendBeacon) navigator.sendBeacon(endpoint, body);
    else void fetch(endpoint, { method: 'POST', body, keepalive: true }).catch(() => undefined);
  } catch {
    /* le journal ne doit jamais lui-même faire planter l'application */
  }
}

function record(level: LogLevel, type: string, error: unknown, context?: Record<string, unknown>) {
  const message = sanitizeMessage(
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Erreur inconnue',
  );
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    route: currentRoute(),
    type,
    message,
    context: sanitizeContext(context),
  };
  push(entry);
  forward(entry);
  const fn = level === 'error' ? console.error : console.warn;
  fn(`[${type}]`, message, entry.context ?? '');
}

export function logError(type: string, error: unknown, context?: Record<string, unknown>): void {
  record('error', type, error, context);
}

export function logWarn(type: string, error: unknown, context?: Record<string, unknown>): void {
  record('warn', type, error, context);
}

/** Dernières erreurs de la session (lecture seule) — panneau admin. */
export function getRecentErrors(): readonly LogEntry[] {
  return buffer.slice();
}

/** À appeler une fois au démarrage : capte les erreurs non gérées. */
export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    // Erreurs de chargement de ressource (img/script) : bruit, pas un crash.
    if (!(e.error instanceof Error) && !e.message) return;
    logError('window.error', e.error ?? e.message, { source: e.filename ?? '' });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    // Annulation volontaire (AbortController) : jamais une erreur.
    if (reason && typeof reason === 'object' && (reason as { name?: string }).name === 'AbortError') return;
    logError('unhandledrejection', reason instanceof Error ? reason : String(reason));
  });
}
