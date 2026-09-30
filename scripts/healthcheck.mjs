#!/usr/bin/env node
// Vérification de disponibilité (PHASE 6, règle 17) — sans dépendance.
//
//   node scripts/healthcheck.mjs [URL_APP]
//   npm run healthcheck -- https://votre-app.onrender.com
//
// Contrôle : (1) l'application répond, (2) le manifeste PWA est valide,
// (3) l'API Supabase répond (requête publique de lecture, limitée à 1
// ligne). Code de sortie 0 = tout va bien, 1 = au moins un contrôle
// échoue → utilisable tel quel par UptimeRobot, Better Stack, un cron,
// GitHub Actions ou le "Health Check Path" de Render. Aucun fournisseur
// n'est imposé. Les variables sont lues dans l'environnement :
//   HEALTHCHECK_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
const appUrl = (process.argv[2] || process.env.HEALTHCHECK_URL || '').replace(/\/$/, '');
const supaUrl = process.env.VITE_SUPABASE_URL;
const supaKey = process.env.VITE_SUPABASE_ANON_KEY;
const TIMEOUT_MS = 10_000;

async function timed(label, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    console.log(`OK    ${label} (${Date.now() - t0} ms)${detail ? ' — ' + detail : ''}`);
    return true;
  } catch (e) {
    console.error(`ÉCHEC ${label} (${Date.now() - t0} ms) — ${e.message}`);
    return false;
  }
}
const get = (url, init = {}) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });

const results = [];
if (appUrl) {
  results.push(await timed('Application', async () => {
    const r = await get(appUrl + '/');
    if (!r.ok) throw new Error('HTTP ' + r.status);
  }));
  results.push(await timed('Manifeste PWA', async () => {
    const r = await get(appUrl + '/manifest.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const m = await r.json();
    if (!m.name || !m.start_url || !Array.isArray(m.icons)) throw new Error('manifeste incomplet');
  }));
} else {
  console.log('(pas d’URL d’application fournie : contrôle de l’application ignoré)');
}
if (supaUrl && supaKey) {
  results.push(await timed('API Supabase', async () => {
    const r = await get(`${supaUrl}/rest/v1/campuses?select=id&limit=1`, {
      headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
  }));
} else {
  console.log('(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY absents : contrôle Supabase ignoré)');
}
if (results.length === 0) {
  console.error('Aucun contrôle exécuté.');
  process.exit(1);
}
process.exit(results.every(Boolean) ? 0 : 1);
