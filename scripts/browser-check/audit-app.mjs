// ============================================================================
// audit-app.mjs — audit NAVIGATEUR réel de HEC LOCALISATION (Playwright + Chromium).
//
// Ce que ce script prouve : le comportement de l'interface dans un vrai navigateur, avec un faux
// serveur Supabase et un faux proxy de routage (fixtures de TEST fictives, voir mock-supabase.mjs).
// Ce qu'il ne prouve PAS : le fonctionnement avec Supabase, OpenRouteService ou un appareil réels.
//
// Usage :
//   npm i --no-save playwright-core            (ou : npm i --no-save playwright && npx playwright install chromium)
//   CHROMIUM_PATH=/chemin/vers/chrome node scripts/browser-check/audit-app.mjs [routing|responsive|all]
// Sortie : audit-output/browser-audit.json + captures dans audit-output/shots/
// ============================================================================
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { installMockSupabase, SUPABASE_URL, LOC_FAR, LOC_ENTRANCE, USERS } from './mock-supabase.mjs';

const require = createRequire(process.env.PW_NODE_MODULES_PARENT ? path.join(process.env.PW_NODE_MODULES_PARENT, 'x.js') : import.meta.url);
const { chromium } = require('playwright-core');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'audit-output');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PORT = Number(process.env.AUDIT_PORT || 5188);
const BASE = `http://localhost:${PORT}`;
const ST = `${BASE}/browser-styles`;
const MODE = process.argv[2] || 'all';

// Le panneau existe en deux exemplaires (mobile / bureau) : on ne cible que celui qui est affiché.
const PANEL = '[role="region"][aria-label="Panneau d’itinéraire"]';
const visiblePanel = (page) => page.locator(`${PANEL} >> visible=true`).first();
const VISIBLE_FN = `(sel) => [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')`;

const results = { startedAt: new Date().toISOString(), routing: [], responsive: [], adminData: [], styleSwitch: [], notes: [] };
// Cumul : on conserve les mesures responsive déjà enregistrées pour les pages NON relancées (AUDIT_PAGES=a,b).
const ONLY_PAGES = (process.env.AUDIT_PAGES || '').split(',').map((x) => x.trim()).filter(Boolean);
const OUT_FILE = path.join(OUT, 'browser-audit.json');
if (ONLY_PAGES.length && fs.existsSync(OUT_FILE)) {
  try { const prev = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); results.responsive = (prev.responsive || []).filter((r) => !ONLY_PAGES.includes(r.page)); results.routing = prev.routing || []; results.adminData = prev.adminData || []; results.styleSwitch = prev.styleSwitch || []; } catch { /* ignore */ }
}
const save = () => fs.writeFileSync(path.join(OUT, 'browser-audit.json'), JSON.stringify(results, null, 2));
const log = (...a) => console.log(...a);

// ---------- serveur Vite avec configuration de TEST (aucun secret) ----------
async function startVite() {
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_ANON_KEY: 'anon-key-de-test',
    VITE_MAP_PROVIDER: 'custom',
    VITE_MAP_STYLE_URL_PLAN: `${ST}/plan.json`, VITE_MAP_STYLE_URL_SATELLITE: `${ST}/satellite.json`,
    VITE_MAP_STYLE_URL_TOPO: `${ST}/topo.json`, VITE_MAP_STYLE_URL_DARK: `${ST}/plan.json`, VITE_MAP_STYLE_URL_HYBRID: `${ST}/satellite.json`,
    VITE_ROUTING_PROVIDER: 'proxy',
  };
  // Les styles locaux sont servis depuis public/ le temps de l'audit (copie temporaire, supprimée à la fin).
  const pub = path.join(ROOT, 'public', 'browser-styles');
  fs.mkdirSync(pub, { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts/browser-check/harness/styles'))) {
    fs.copyFileSync(path.join(ROOT, 'scripts/browser-check/harness/styles', f), path.join(pub, f));
  }
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(BASE); if (r.ok) return { server, pub }; } catch { /* attente */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Vite ne démarre pas');
}

const LAUNCH = () => chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

// Bloque tout accès extérieur non prévu (tuiles, Overpass, géocodage…) : le test ne dépend d'aucun service réel.
async function blockExternal(context) {
  await context.route(/^https?:\/\/(?!localhost)(?!example\.invalid).*/, (r) => r.abort());
}

// ======================================================================
// A. ÉTATS D'ITINÉRAIRE — le proxy de routage est simulé scénario par scénario
// ======================================================================
const A = [15.3002, -4.3215]; // départ GPS de test (hors réseau interne : aucun nœud dans les fixtures)
// Longueur (m) d'une polyligne [lng, lat] — formule de haversine.
function polylineLength(coords) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1], [lng2, lat2] = coords[i];
    const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(h));
  }
  return total;
}
// Réponse de test COHÉRENTE : la distance annoncée est la longueur réelle du tracé fourni.
const ORS_OK = (from, to) => {
  const coords = [from, [from[0], (from[1] + to[1]) / 2], to];
  const dist = polylineLength(coords);
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { summary: { distance: dist, duration: dist / 1.25 }, segments: [{ steps: [
        { instruction: 'Marchez vers le nord', distance: dist / 2, duration: dist / 2.5, way_points: [0, 1] },
        { instruction: 'Arrivée', distance: dist / 2, duration: dist / 2.5, way_points: [1, 2] }] }] },
      geometry: { type: 'LineString', coordinates: coords },
    }],
  };
};
const EXPECTED_LENGTH = polylineLength([A, [A[0], (A[1] + -4.3202) / 2], [15.2996, -4.3202]]);

const SCENARIOS = [
  { id: 'success', label: 'itinéraire calculé', handler: (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ORS_OK(body.from, body.to)) }),
    expect: { alert: false, retry: false } },
  { id: 'network', label: 'erreur réseau (connexion coupée)', handler: (route) => route.abort('connectionreset'),
    expect: { alert: true, category: 'network', title: /Erreur réseau/, retry: true } },
  { id: 'upstream', label: 'fournisseur indisponible (503 upstream_unavailable)', handler: (route) => route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { kind: 'upstream_unavailable', message: 'Le service de calcul d’itinéraire est momentanément indisponible.' } }) }),
    expect: { alert: true, category: 'unavailable', title: /momentanément indisponible/, retry: true } },
  { id: 'ratelimit', label: 'quota atteint (429)', handler: (route) => route.fulfill({ status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'retry-after': '30' }, body: JSON.stringify({ error: { kind: 'rate_limited', message: 'Trop de demandes, réessayez dans un instant.' } }) }),
    expect: { alert: true, category: 'unavailable', retry: true } },
  { id: 'misconfig', label: 'erreur de configuration (502 service_misconfigured)', handler: (route) => route.fulfill({ status: 502, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { kind: 'service_misconfigured', message: 'Le service d’itinéraire est mal configuré sur le serveur.' } }) }),
    expect: { alert: true, category: 'configuration', title: /configuration/i, retry: false } },
  { id: 'notdeployed', label: 'fonction non déployée (404 sans corps)', handler: (route) => route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ message: 'Function not found' }) }),
    expect: { alert: true, category: 'configuration', retry: false } },
  { id: 'forbidden', label: 'jeton / origine refusés (403 passerelle)', handler: (route) => route.fulfill({ status: 403, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ message: 'Invalid JWT' }) }),
    expect: { alert: true, category: 'configuration', retry: false } },
  { id: 'noroute', label: 'destination introuvable (404 no_route)', handler: (route) => route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { kind: 'no_route', message: 'Aucun chemin piéton trouvé entre ces deux points.' } }) }),
    expect: { alert: true, category: 'not_found', title: /Aucun itinéraire/, retry: false } },
  { id: 'emptyfeatures', label: 'réponse 200 sans aucun chemin (features vide)', handler: (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ features: [] }) }),
    expect: { alert: true, category: 'not_found', title: /Aucun itinéraire/, retry: false } },
  { id: 'garbled', label: 'réponse 200 corrompue (non JSON)', handler: (route) => route.fulfill({ status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<html>proxy captif</html>' }),
    expect: { alert: true, category: 'unavailable', retry: true } },
];

async function runRoutingScenario(browser, sc, width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 844 }, geolocation: { latitude: A[1], longitude: A[0], accuracy: 15 }, permissions: ['geolocation'],
  });
  await blockExternal(context);
  await installMockSupabase(context, { user: null });
  const hits = [];
  await context.route('**/functions/v1/route-walking', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const body = JSON.parse(route.request().postData() || '{}');
    hits.push(body);
    return sc.handler(route, body, hits.length);
  });
  if (process.env.AUDIT_DEBUG) {
    await context.addInitScript(() => {
      const g = navigator.geolocation; const w = g.watchPosition.bind(g); const c = g.getCurrentPosition.bind(g);
      g.watchPosition = (ok, ko, o) => { console.log('GEO watchPosition', JSON.stringify(o)); return w((p) => { console.log('GEO fix', p.coords.accuracy); ok(p); }, (e) => { console.log('GEO err', e.code, e.message); ko && ko(e); }, o); };
      g.getCurrentPosition = (ok, ko, o) => { console.log('GEO getCurrentPosition', JSON.stringify(o)); return c((p) => { console.log('GEO fix', p.coords.accuracy); ok(p); }, (e) => { console.log('GEO err', e.code, e.message); ko && ko(e); }, o); };
    });
  }
  const page = await context.newPage();
  if (process.env.AUDIT_DEBUG) page.on('console', (m) => log('   [page]', m.text().slice(0, 200)));
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(`${BASE}/#/map?nav=${LOC_FAR}`, { waitUntil: 'domcontentloaded' });
  const out = { scenario: sc.id, label: sc.label, width, checks: [], ok: true, calls: 0 };
  const check = (name, pass, detail = '') => { out.checks.push({ name, pass: !!pass, detail }); if (!pass) out.ok = false; };
  try {
    // laisse le temps : géolocalisation → départ → délai anti-rebond 400 ms → appel proxy → rendu
    await visiblePanel(page).waitFor({ timeout: 25000 });
    await page.waitForFunction(([sel, fn]) => {
      const r = eval(fn)(sel);
      return r && (r.querySelector('[role="alert"]') || /\d+\s?m\b|\d+\s?min/.test(r.textContent || ''));
    }, [PANEL, VISIBLE_FN], { timeout: 25000 });
    const panel = visiblePanel(page);
    const alert = panel.locator('[role="alert"]');
    const hasAlert = (await alert.count()) > 0;
    const panelText = (await panel.innerText()).replace(/\s+/g, ' ');
    out.panelText = panelText.slice(0, 500);
    out.calls = hits.length;
    check('un appel au proxy a été émis', hits.length >= 1, `appels=${hits.length}`);
    check(`alerte ${sc.expect.alert ? 'affichée' : 'absente'}`, hasAlert === sc.expect.alert, hasAlert ? await alert.innerText() : '');
    if (sc.expect.alert) {
      const cat = await alert.first().getAttribute('data-route-failure');
      if (sc.expect.category) check(`catégorie « ${sc.expect.category} »`, cat === sc.expect.category, `obtenu=${cat}`);
      if (sc.expect.title) check(`titre ${sc.expect.title}`, sc.expect.title.test(panelText), panelText.slice(0, 200));
      const retryBtn = panel.getByRole('button', { name: 'Réessayer' });
      check(`bouton « Réessayer » ${sc.expect.retry ? 'présent' : 'absent'}`, ((await retryBtn.count()) > 0) === sc.expect.retry);
      check('le sélecteur de départ reste utilisable après l’erreur', (await panel.locator('select').count()) > 0);
      // jamais de faux tracé : aucune distance/durée de succès affichée dans le panneau d'erreur
      check('aucune distance ni durée présentée en cas d’échec', !/Itinéraire piéton calculé|Durée/i.test(panelText), panelText.slice(0, 200));
    } else {
      check('succès : « Itinéraire piéton calculé » affiché', /Itinéraire piéton calculé/.test(panelText), panelText.slice(0, 160));
      const m = /DISTANCE\s+(\d+(?:[.,]\d+)?)\s*(km|m)\b/i.exec(panelText);
      const shown = m ? Number(m[1].replace(',', '.')) * (m[2].toLowerCase() === 'km' ? 1000 : 1) : NaN;
      check('succès : la distance affichée correspond à la longueur du tracé (±3 %)', Number.isFinite(shown) && Math.abs(shown - EXPECTED_LENGTH) / EXPECTED_LENGTH < 0.03, `affichée=${shown} m, attendue≈${Math.round(EXPECTED_LENGTH)} m`);
      check('succès : aucune alerte, durée affichée', !hasAlert && /min/.test(panelText));
    }
    await page.screenshot({ path: path.join(SHOTS, `route-${sc.id}-${width}.png`) });
  } catch (e) {
    check('scénario exécuté sans exception', false, String(e).slice(0, 300));
    try { await page.screenshot({ path: path.join(SHOTS, `route-${sc.id}-${width}-ERREUR.png`) }); } catch { /* ignore */ }
  }
  check('aucune exception JavaScript non gérée', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));
  await context.close();
  return out;
}

// « Réessayer » : 1er appel en échec réseau, 2e appel OK → l'itinéraire apparaît sans changer de départ.
async function runRetryScenario(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: A[1], longitude: A[0], accuracy: 15 }, permissions: ['geolocation'] });
  await blockExternal(context);
  await installMockSupabase(context, { user: null });
  let n = 0;
  await context.route('**/functions/v1/route-walking', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    n++;
    const body = JSON.parse(route.request().postData() || '{}');
    if (n === 1) return route.abort('connectionreset');
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ORS_OK(body.from, body.to)) });
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/#/map?nav=${LOC_FAR}`, { waitUntil: 'domcontentloaded' });
  const out = { scenario: 'retry', label: 'réessayer après une erreur réseau', width: 390, checks: [], ok: true };
  const check = (name, pass, detail = '') => { out.checks.push({ name, pass: !!pass, detail }); if (!pass) out.ok = false; };
  try {
    const panel = visiblePanel(page);
    await panel.locator('[role="alert"]').waitFor({ timeout: 25000 });
    check('1re tentative : erreur réseau affichée', /Erreur réseau/.test(await panel.innerText()));
    await panel.getByRole('button', { name: 'Réessayer' }).click();
    await page.waitForFunction(([sel, fn]) => { const r = eval(fn)(sel); return r && !r.querySelector('[role="alert"]') && /Itinéraire piéton calculé/.test(r.textContent || ''); }, [PANEL, VISIBLE_FN], { timeout: 15000 });
    check('après « Réessayer » : l’itinéraire est calculé (2e appel)', n === 2, `appels=${n}`);
    check('l’erreur a disparu', (await panel.locator('[role="alert"]').count()) === 0);
    await page.screenshot({ path: path.join(SHOTS, 'route-retry-after-390.png') });
  } catch (e) {
    check('scénario exécuté', false, String(e).slice(0, 300));
    try { await page.screenshot({ path: path.join(SHOTS, 'route-retry-ERREUR.png') }); } catch { /* ignore */ }
  }
  await context.close();
  return out;
}

// ======================================================================
// B. RESPONSIVE — 8 largeurs × pages (visiteur / étudiant / administrateur)
// ======================================================================
const WIDTHS = [320, 360, 390, 430, 768, 1024, 1280, 1440];
const PAGES = [
  { user: null, hash: '/', name: 'accueil-visiteur' },
  { user: null, hash: '/map', name: 'carte' },
  { user: null, hash: `/map?loc=${LOC_ENTRANCE}`, name: 'carte-fiche-lieu' },
  { user: null, hash: '/privacy', name: 'confidentialite' },
  { user: null, hash: '/terms', name: 'conditions' },
  { user: null, hash: '/help', name: 'aide' },
  { user: 'student', hash: '/dashboard', name: 'tableau-de-bord' },
  { user: 'student', hash: '/search', name: 'recherche' },
  { user: 'student', hash: '/profile', name: 'profil' },
  { user: 'student', hash: '/settings', name: 'parametres' },
  { user: 'admin', hash: '/admin', name: 'administration' },
  { user: null, hash: '/login', name: 'connexion' },
  { user: null, hash: '/register', name: 'inscription' },
  { user: null, hash: '/about', name: 'a-propos' },
  { user: null, hash: '/cookies', name: 'cookies' },
  { user: null, hash: '/billing', name: 'tarifs' },
  { user: null, hash: '/qr-scan', name: 'scan-qr' },
  { user: 'student', hash: '/events', name: 'evenements' },
  { user: 'student', hash: '/favorites', name: 'favoris' },
  { user: 'student', hash: '/notifications', name: 'notifications' },
  { user: 'student', hash: '/schedule', name: 'planning' },
  { user: 'student', hash: '/bookings', name: 'reservations' },
  { user: 'student', hash: '/reports', name: 'signalements' },
  { user: 'student', hash: '/assistant', name: 'assistant' },
  { user: 'student', hash: '/tour', name: 'visite-guidee' },
];

async function measure(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const de = document.documentElement;
    const overflowX = Math.max(de.scrollWidth, document.body.scrollWidth) - vw;
    const wide = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (r.right > vw + 1 && !el.closest('[class*="overflow-x"],[style*="overflow"],canvas,.maplibregl-map,svg')) {
        // ignore les éléments contenus dans un conteneur à défilement horizontal
        let p = el.parentElement, scroll = false;
        while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { scroll = true; break; } p = p.parentElement; }
        if (!scroll) wide.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 2).join('.') : ''}:${Math.round(r.right - vw)}px`);
      }
    }
    // cibles tactiles : boutons/liens/champs visibles < 44 px (indicatif, WCAG 2.5.5 niveau AAA / 24 px AA)
    const small = [];
    for (const el of document.querySelectorAll('button, a[href], select, input:not([type=hidden]), [role=button]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (r.height < 24 || r.width < 24) small.push(`${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 25)}]:${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const unlabeled = [];
    for (const el of document.querySelectorAll('button, a[href], select, input:not([type=hidden]), textarea')) {
      const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
      const name = (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.textContent || '').trim()
        || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()) || el.closest('label')?.textContent?.trim() || el.getAttribute('placeholder') || '';
      if (!name) unlabeled.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : ''}`);
    }
    const blurred = [...document.querySelectorAll('*')].filter((el) => { const cs = getComputedStyle(el); return (cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.filter && cs.filter.includes('blur')); }).length;
    return { vw, overflowX, wide: [...new Set(wide)].slice(0, 6), smallTargets: small.length, smallSamples: small.slice(0, 5), unlabeled: [...new Set(unlabeled)].slice(0, 5), blurElements: blurred, h1: document.querySelectorAll('h1').length, title: document.title };
  });
}

async function measureOne(browser, pg, width) {
  const context = await browser.newContext({ viewport: { width, height: width < 700 ? 800 : 900 }, geolocation: { latitude: A[1], longitude: A[0], accuracy: 15 }, permissions: ['geolocation'], deviceScaleFactor: 1, hasTouch: width < 700, isMobile: width < 700 });
  await blockExternal(context);
  await installMockSupabase(context, { user: pg.user });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  const entry = { page: pg.name, user: pg.user ?? 'visiteur', width };
  try {
    await page.goto(`${BASE}/#${pg.hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(pg.hash.startsWith('/map') ? 3000 : 1800);
    Object.assign(entry, await measure(page));
    entry.pageErrors = errors;
    entry.bodyTextLength = await page.evaluate(() => document.body.innerText.length);
    entry.ok = entry.overflowX <= 1 && errors.length === 0 && entry.bodyTextLength > 20;
    if ([320, 390, 1280].includes(width)) await page.screenshot({ path: path.join(SHOTS, `${pg.name}-${width}.png`) });
  } catch (e) { entry.ok = false; entry.error = String(e).slice(0, 200); }
  await context.close().catch(() => {});
  return entry;
}

async function runResponsive(browser) {
  const pages = PAGES.filter((pg) => !ONLY_PAGES.length || ONLY_PAGES.includes(pg.name));
  for (const pg of pages) {
    // Un navigateur neuf par page (évite l'accumulation mémoire), 4 largeurs en parallèle.
    const b = await LAUNCH();
    try {
      for (let i = 0; i < WIDTHS.length; i += 4) {
        const batch = await Promise.all(WIDTHS.slice(i, i + 4).map((w) => measureOne(b, pg, w)));
        results.responsive.push(...batch);
      }
    } finally { await b.close().catch(() => {}); }
    save();
    log(`responsive ${pg.name} : ${results.responsive.filter((r) => r.page === pg.name && r.ok).length}/${WIDTHS.length} largeurs sans débordement ni erreur`);
  }
}


// ======================================================================
// C. ADMINISTRATION → DONNÉES (inventaire, import CSV, journal) — rôle ADMIN simulé
// ======================================================================
const CSV_INVALID = '\uFEFFtype;code;name;description;category;building_code;floor_level;floor_name;kind;capacity;lng;lat;location_accuracy;is_accessible\r\nbuilding;T1;Batiment test valide;;academic;;;;;;15.3001;-4.3201;5;oui\r\nbuilding;T2;Batiment test coordonnee hex;;academic;;;;;;0x10;-4.3202;5;oui\r\n';
const CSV_VALID = '\uFEFFtype;code;name;description;category;building_code;floor_level;floor_name;kind;capacity;lng;lat;location_accuracy;is_accessible\r\nbuilding;T1;Batiment test valide;;academic;;;;;;15,3001;-4,3201;5;oui\r\n';

async function runAdminData(browser) {
  const out = [];
  for (const width of [320, 390, 768, 1280]) {
    const entry = { scenario: 'admin-donnees', width, checks: [], ok: true };
    const check = (name, pass, detail = '') => { entry.checks.push({ name, pass: !!pass, detail }); if (!pass) entry.ok = false; };
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 700, isMobile: width < 700 });
    await blockExternal(context);
    const mock = await installMockSupabase(context, { user: 'admin' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    try {
      await page.goto(`${BASE}/#/admin`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Données', exact: true }).first().click({ timeout: 20000 });
      await page.getByRole('tab', { name: 'Qualité des données' }).waitFor({ timeout: 15000 });
      await page.waitForTimeout(800);
      const text = (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ');
      check('inventaire : bâtiments à vérifier affichés (le bâtiment déjà validé n’y figure pas)', /Bâtiment TEST B/.test(text) && !/Bâtiment TEST A/.test(text), text.slice(0, 160));
      check('inventaire : donnée de démonstration identifiée', /[Dd]émonstration/.test(text), text.slice(0, 120));
      check('inventaire : « Photo non disponible » (aucune photo fictive)', /Photo non disponible/.test(text));
      const link = page.getByRole('link', { name: /Vérifier sur la carte/ }).first();
      const href = await link.getAttribute('href');
      check('lien « Vérifier sur la carte » → OpenStreetMap avec coordonnées', /openstreetmap\.org\/\?mlat=-4\.\d+&mlon=15\.\d+#map=19\//.test(href || ''), href || '');
      check('le lien s’ouvre dans un nouvel onglet sans fuite (noopener)', (await link.getAttribute('rel'))?.includes('noopener') && (await link.getAttribute('target')) === '_blank');
      let m = await measure(page);
      check('onglet Qualité : aucun débordement horizontal', m.overflowX <= 1, JSON.stringify(m.wide));
      if ([320, 1280].includes(width)) await page.screenshot({ path: path.join(SHOTS, `admin-donnees-qualite-${width}.png`) });

      // --- Import CSV invalide : aucune écriture ---
      await page.getByRole('tab', { name: 'Import CSV' }).click();
      const input = page.locator('input[type="file"]');
      await input.setInputFiles({ name: 'invalide.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV_INVALID, 'utf8') });
      await page.getByText(/Erreurs bloquantes/).waitFor({ timeout: 10000 });
      const t2 = (await page.locator('section[aria-label="Prévisualisation de l’import"]').innerText()).replace(/\s+/g, ' ');
      check('CSV invalide : l’erreur désigne la ligne fautive (ligne 3)', /Erreur — ligne 3/.test(t2), t2.slice(0, 220));
      check('CSV invalide : bouton « Importer » absent', (await page.getByRole('button', { name: /^Importer$/ }).count()) === 0);
      check('CSV invalide : « rien ne sera écrit » annoncé', /rien ne sera écrit/i.test(t2));
      check('CSV invalide : aucun appel d’écriture (RPC) émis', !mock.calls.some((c) => c.path.includes('import_campus_data')));
      m = await measure(page);
      check('onglet Import (erreur) : aucun débordement horizontal', m.overflowX <= 1, JSON.stringify(m.wide));
      if ([320, 1280].includes(width)) await page.screenshot({ path: path.join(SHOTS, `admin-donnees-import-erreur-${width}.png`) });

      // --- Import CSV valide : confirmation obligatoire, puis UN seul appel atomique ---
      await input.setInputFiles({ name: 'valide.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV_VALID, 'utf8') });
      await page.getByRole('button', { name: /^Importer$/ }).waitFor({ timeout: 10000 });
      const importBtn = page.getByRole('button', { name: /^Importer$/ });
      check('CSV valide : « Importer » désactivé tant que la case de relecture n’est pas cochée', await importBtn.isDisabled());
      await page.getByRole('checkbox').check();
      await importBtn.click();
      await page.waitForFunction(() => document.body.innerText.includes('statut') || document.querySelector('[role="status"]'), null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);
      const rpc = mock.calls.filter((c) => c.path.includes('import_campus_data'));
      check('CSV valide : exactement un appel RPC atomique', rpc.length === 1, `appels=${rpc.length}`);
      const payload = rpc[0] ? JSON.parse(rpc[0].body || '{}') : {};
      const sent = payload.p_payload?.buildings ?? [];
      check('CSV valide : coordonnées à virgule décimale correctement transmises (15,3001 → 15.3001)', sent[0]?.lng === 15.3001 && sent[0]?.lat === -4.3201, JSON.stringify(sent[0] ?? {}));

      // --- Journal d'audit ---
      await page.getByRole('tab', { name: /Journal d’audit/ }).click();
      await page.waitForTimeout(800);
      const t3 = (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ');
      check('journal d’audit : entrée « Validation » visible', /Validation/.test(t3) && /Bâtiment TEST A/.test(t3), t3.slice(0, 160));
      m = await measure(page);
      check('onglet Journal : aucun débordement horizontal', m.overflowX <= 1, JSON.stringify(m.wide));
      if ([320, 1280].includes(width)) await page.screenshot({ path: path.join(SHOTS, `admin-donnees-audit-${width}.png`) });
    } catch (e) {
      check('scénario exécuté sans exception', false, String(e).slice(0, 300));
      try { await page.screenshot({ path: path.join(SHOTS, `admin-donnees-ERREUR-${width}.png`) }); } catch { /* ignore */ }
    }
    check('aucune exception JavaScript non gérée', errors.length === 0, errors.join(' | '));
    await context.close();
    out.push(entry);
  }
  return out;
}


// ======================================================================
// D. CHANGEMENT DE STYLE DE CARTE — marqueurs et tracé conservés (Plan, Satellite, Hybride, Topo, Sombre)
//    Les styles de test sont des aplats de couleur SANS tuiles : on vérifie la conservation des couches
//    de l'application, pas la netteté des tuiles d'un fournisseur réel.
// ======================================================================
async function routePixels(page, hex) {
  const buf = await page.screenshot();
  const b64 = buf.toString('base64');
  return page.evaluate(async ([data, color]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    const [r0, g0, b0] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - r0) < 18 && Math.abs(px[i + 1] - g0) < 18 && Math.abs(px[i + 2] - b0) < 18) n++;
    return n;
  }, [b64, hex]);
}

async function runStyleSwitch(browser, routeHex) {
  const entry = { scenario: 'changement-de-style', width: 390, checks: [], ok: true, perStyle: [] };
  const check = (name, pass, detail = '') => { entry.checks.push({ name, pass: !!pass, detail }); if (!pass) entry.ok = false; };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: A[1], longitude: A[0], accuracy: 15 }, permissions: ['geolocation'], hasTouch: true, isMobile: true });
  await blockExternal(context);
  await installMockSupabase(context, { user: null });
  await context.route('**/functions/v1/route-walking', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const body = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ORS_OK(body.from, body.to)) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  try {
    await page.goto(`${BASE}/#/map?nav=${LOC_FAR}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(([sel, fn]) => /Itinéraire piéton calculé/.test(eval(fn)(sel)?.textContent || ''), [PANEL, VISIBLE_FN], { timeout: 25000 });
    // réduire le panneau pour dégager la carte : on mesure les pixels sur toute la page, le tracé est assez long pour rester visible
    await page.waitForTimeout(1200);
    const base = await routePixels(page, routeHex);
    const baseMarkers = await page.locator('.maplibregl-marker').count();
    entry.perStyle.push({ style: 'Plan (départ)', markers: baseMarkers, routePixels: base });
    check('départ : tracé visible sur la carte', base > 150, `pixels=${base}`);
    check('départ : marqueurs présents', baseMarkers >= 1, `marqueurs=${baseMarkers}`);
    await page.getByRole('button', { name: 'Filtres et style de carte' }).click();
    await page.waitForTimeout(1200);
    // Référence MESURÉE panneau de styles ouvert (il recouvre une partie de la carte sur mobile), sinon la comparaison est faussée.
    const open0 = await routePixels(page, routeHex);
    entry.perStyle.push({ style: 'Plan (panneau ouvert)', markers: await page.locator('.maplibregl-marker').count(), routePixels: open0 });
    check('panneau de styles ouvert : tracé toujours visible', open0 > 100, `pixels=${open0}`);
    for (const label of ['Satellite', 'Hybride', 'Topographique', 'Sombre', 'Plan']) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await page.waitForTimeout(1800);
      const selected = (await page.getByRole('tab', { name: label, exact: true }).getAttribute('aria-selected')) === 'true';
      const px = await routePixels(page, routeHex);
      const mk = await page.locator('.maplibregl-marker').count();
      entry.perStyle.push({ style: label, markers: mk, routePixels: px, selected });
      check(`« ${label} » : mode actif`, selected);
      check(`« ${label} » : tracé toujours affiché (≥ 60 % de la référence panneau ouvert)`, px >= open0 * 0.6, `pixels=${px} (référence ${open0})`);
      check(`« ${label} » : marqueurs conservés`, mk === baseMarkers, `marqueurs=${mk} (départ ${baseMarkers})`);
      await page.screenshot({ path: path.join(SHOTS, `style-${label.toLowerCase()}-390.png`) });
    }
    const panelOk = /Itinéraire piéton calculé/.test((await visiblePanel(page).innerText()));
    check('après les changements : panneau d’itinéraire toujours calculé (pas de recalcul/erreur)', panelOk);
  } catch (e) { check('scénario exécuté', false, String(e).slice(0, 300)); try { await page.screenshot({ path: path.join(SHOTS, 'style-ERREUR.png') }); } catch { /* ignore */ } }
  check('aucune exception JavaScript non gérée', errors.length === 0, errors.join(' | '));
  await context.close();
  return entry;
}

// ======================================================================
(async () => {
  const { server, pub } = await startVite();
  const browser = await LAUNCH();
  results.browser = browser.version();
  log('Chromium', results.browser);
  try {
    if (MODE === 'routing' || MODE === 'all') {
      for (const sc of SCENARIOS.filter((x) => !process.env.AUDIT_ONLY || x.id === process.env.AUDIT_ONLY)) {
        const r = await runRoutingScenario(browser, sc);
        results.routing.push(r);
        log(`${r.ok ? 'OK  ' : 'ÉCHEC'} routage — ${r.label}`);
        for (const c of r.checks.filter((c) => !c.pass)) log(`      ✗ ${c.name} :: ${c.detail}`);
        save();
      }
      const r = await runRetryScenario(browser);
      results.routing.push(r);
      log(`${r.ok ? 'OK  ' : 'ÉCHEC'} routage — ${r.label}`);
      for (const c of r.checks.filter((c) => !c.pass)) log(`      ✗ ${c.name} :: ${c.detail}`);
      // quelques largeurs pour l'état d'erreur (lisibilité du panneau sur petit écran)
      for (const w of [320, 768]) {
        const e = await runRoutingScenario(browser, SCENARIOS.find((s) => s.id === 'upstream'), w);
        results.routing.push(e);
        log(`${e.ok ? 'OK  ' : 'ÉCHEC'} routage — ${e.label} @${w}px`);
      }
      save();
    }
    if (MODE === 'styles' || MODE === 'all') {
      const e = await runStyleSwitch(browser, process.env.ROUTE_HEX || '#2563eb');
      results.styleSwitch = [e];
      log(`${e.ok ? 'OK  ' : 'ÉCHEC'} changement de style de carte`);
      for (const r of e.perStyle) log(`      ${r.style.padEnd(16)} marqueurs=${r.markers} pixels_tracé=${r.routePixels}`);
      for (const c of e.checks.filter((c) => !c.pass)) log(`      ✗ ${c.name} :: ${c.detail}`);
      save();
    }
    if (MODE === 'admin-data' || MODE === 'all') {
      results.adminData = await runAdminData(browser);
      for (const e of results.adminData) { log(`${e.ok ? 'OK  ' : 'ÉCHEC'} admin/Données @${e.width}px`); for (const c of e.checks.filter((c) => !c.pass)) log(`      ✗ ${c.name} :: ${c.detail}`); }
      save();
    }
    if (MODE === 'responsive' || MODE === 'all') await runResponsive(browser);
  } finally {
    await browser.close();
    server.kill('SIGTERM');
    fs.rmSync(pub, { recursive: true, force: true });
    save();
  }
  const bad = results.routing.filter((r) => !r.ok).length + results.responsive.filter((r) => !r.ok).length;
  log(`\nTerminé : ${results.routing.length} scénarios de routage, ${results.responsive.length} mesures responsive, ${bad} en échec.`);
})().catch((e) => { console.error(e); process.exit(1); });
