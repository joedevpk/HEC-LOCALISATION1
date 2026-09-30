import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Configuration Supabase manquante : créez un fichier .env à la racine du projet " +
      "(copiez .env.example) et renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY " +
      "depuis votre projet Supabase (Project Settings > API), puis redémarrez le serveur.",
  );
}

/*
 * Instance UNIQUE du client Supabase (RÈGLE ABSOLUE : pas de deuxième
 * `createClient()` côté frontend). Il n'y a déjà qu'un seul appel à
 * `createClient()` dans tout le projet — mais en dev, le Hot Module
 * Replacement de Vite peut ré-exécuter ce module (ex. après un edit d'un
 * fichier importé par la chaîne d'imports de `supabase.ts`) sans recharger
 * la page : un deuxième `GoTrueClient` se retrouve alors à essayer
 * d'acquérir le même verrou nommé ("lock:sb-<ref>-auth-token") que le
 * premier, encore actif dans le même onglet, d'où l'erreur
 * NavigatorLockAcquireTimeoutError observée. En attachant l'instance à
 * `import.meta.hot.data` (persistant entre rechargements HMR d'un même
 * module), on garantit qu'un seul GoTrueClient existe réellement dans
 * l'onglet, quel que soit le nombre de rechargements HMR.
 *
 * Ceci ne modifie ni les clés, ni les règles RLS, ni l'auto-refresh : la
 * configuration du client reste strictement identique à avant.
 * `import.meta.hot` est déjà typé par `vite/client` (voir vite-env.d.ts) —
 * aucune déclaration de type supplémentaire n'est nécessaire ici.
 */
/**
 * `fetch` avec délai maximal (PHASE 6, règles 02/07/08) : une requête qui
 * ne répond pas ne doit JAMAIS laisser l'écran en chargement infini.
 * - Requêtes de données (REST/auth) : 15 s.
 * - Envois de fichiers (Storage) : 60 s (connexions mobiles lentes).
 * Le signal d'annulation de l'appelant (AbortController) est respecté.
 * Le message d'erreur contient "timeout" pour être classé comme problème
 * de connexion par l'UI (voir classifyCampusError dans MapPage).
 */
const REQUEST_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 60_000;

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const isUpload = url.includes('/storage/v1/object/') && init?.method && init.method !== 'GET';
  const timeoutMs = isUpload ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  const outer = init?.signal;
  const onOuterAbort = () => controller.abort(outer?.reason);
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener('abort', onOuterAbort, { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted && !outer?.aborted) {
      throw new Error(`Le serveur ne répond pas (timeout ${Math.round(timeoutMs / 1000)} s).`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
  }
};

function createSupabaseClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: { fetch: fetchWithTimeout },
  });
}

const hot = import.meta.hot;

export const supabase: SupabaseClient =
  (hot?.data.supabaseClient as SupabaseClient | undefined) ?? createSupabaseClient();

if (hot) {
  hot.data.supabaseClient = supabase;
  // Ne rien faire de plus ici : on ne veut PAS que ce module se remplace
  // lui-même (accept), on veut seulement conserver l'instance existante
  // à travers les rechargements HMR déclenchés par d'autres modules.
}
