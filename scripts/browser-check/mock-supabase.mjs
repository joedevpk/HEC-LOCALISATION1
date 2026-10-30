// ============================================================================
// mock-supabase.mjs — faux serveur Supabase pour les tests NAVIGATEUR uniquement.
//
//  * N'appartient PAS à l'application : jamais importé par `src/`.
//  * Toutes les données ci-dessous sont des FIXTURES DE TEST FICTIVES (noms « TEST »).
//    Aucune ne représente un lieu réel de la HEC Kinshasa ; elles ne sont insérées dans
//    aucune base. Elles servent uniquement à vérifier l'interface.
//  * Intercepte (Playwright) les appels vers SUPABASE_URL : REST (/rest/v1), Auth (/auth/v1),
//    Storage (/storage/v1). Les appels à la fonction de routage sont gérés par le scénario.
// ============================================================================

export const SUPABASE_URL = 'https://example.invalid';
export const STORAGE_KEY = 'sb-example-auth-token';

const NOW = '2026-10-28T08:00:00.000Z';
const CAMPUS_ID = '11111111-1111-4111-8111-111111111111';
const B1 = '22222222-2222-4222-8222-222222222201';
const B2 = '22222222-2222-4222-8222-222222222202';
const B3 = '22222222-2222-4222-8222-222222222203';
export const LOC_ENTRANCE = '33333333-3333-4333-8333-333333333301';
export const LOC_ROOM = '33333333-3333-4333-8333-333333333302';
export const LOC_FAR = '33333333-3333-4333-8333-333333333303';

export const USERS = {
  student: { id: '44444444-4444-4444-8444-444444444401', email: 'etudiant.test@example.invalid', role: 'STUDENT', full_name: 'Étudiant TEST' },
  manager: { id: '44444444-4444-4444-8444-444444444402', email: 'gestionnaire.test@example.invalid', role: 'CAMPUS_MANAGER', full_name: 'Gestionnaire TEST' },
  admin: { id: '44444444-4444-4444-8444-444444444403', email: 'admin.test@example.invalid', role: 'ADMIN', full_name: 'Administrateur TEST' },
};

function fixtures() {
  const bld = (id, name, code, lng, lat, extra = {}) => ({
    id, campus_id: CAMPUS_ID, name, code, description: 'Fixture de test fictive.', category: 'academic', color: '#2563eb',
    center_lng: lng, center_lat: lat, floor_count: 2, created_at: NOW, archived_at: null,
    verification_status: 'pending', verified_at: null, verified_by: null, data_source: null, location_accuracy: null, photo_verified: false,
    ...extra,
  });
  return {
    campuses: [{ id: CAMPUS_ID, name: 'Campus TEST (fixture)', tagline: '', city: '', center_lng: 15.3, center_lat: -4.32, default_zoom: 17, created_at: NOW }],
    buildings: [
      bld(B1, 'Bâtiment TEST A', 'TA', 15.3003, -4.3198, { verification_status: 'validated', verified_at: NOW }),
      bld(B2, 'Bâtiment TEST B avec un nom volontairement très long pour vérifier les retours à la ligne', 'TB', 15.2996, -4.3203),
      bld(B3, 'Bâtiment TEST démo', 'TD', 15.3005, -4.3199, { data_source: 'seed_demo' }),
    ],
    floors: [{ id: '55555555-5555-4555-8555-555555555501', building_id: B1, level: 1, name: '1er étage', sort_order: 1 }],
    locations: [
      { id: LOC_ENTRANCE, building_id: B1, floor_id: null, name: 'Entrée TEST A', code: 'TA-E', kind: 'entrance', category: 'entrance', description: '', capacity: null, lng: 15.3003, lat: -4.3197, is_accessible: true, created_at: NOW, archived_at: null, verification_status: 'pending', verified_at: null, verified_by: null, data_source: null, location_accuracy: null, photo_verified: false },
      { id: LOC_ROOM, building_id: B1, floor_id: '55555555-5555-4555-8555-555555555501', name: 'Salle TEST 101', code: 'TA-101', kind: 'room', category: 'general', description: '', capacity: 30, lng: 15.30035, lat: -4.31985, is_accessible: true, created_at: NOW, archived_at: null, verification_status: 'pending', verified_at: null, verified_by: null, data_source: null, location_accuracy: null, photo_verified: false },
      { id: LOC_FAR, building_id: B2, floor_id: null, name: 'Entrée TEST B', code: 'TB-E', kind: 'entrance', category: 'entrance', description: '', capacity: null, lng: 15.2996, lat: -4.3202, is_accessible: true, created_at: NOW, archived_at: null, verification_status: 'pending', verified_at: null, verified_by: null, data_source: null, location_accuracy: null, photo_verified: false },
    ],
    building_images: [], location_images: [], route_nodes: [], route_segments: [],
    campus_events: [{ id: '66666666-6666-4666-8666-666666666601', campus_id: CAMPUS_ID, title: 'Événement TEST', description: 'Fixture.', image_url: '', starts_at: '2026-11-05T09:00:00Z', location_label: 'Salle TEST 101', organizer: 'TEST', created_at: NOW }],
    announcements: [{ id: '77777777-7777-4777-8777-777777777701', campus_id: CAMPUS_ID, title: 'Annonce TEST', body: 'Fixture.', category: 'GENERAL', created_at: NOW }],
    qr_codes: [], schedules: [], favorites: [], search_history: [], notifications: [], bookings: [], reports: [], user_settings: [],
    profiles: Object.values(USERS).map((u) => ({ id: u.id, full_name: u.full_name, role: u.role, created_at: NOW, avatar_url: null })),
    audit_log: [
      { id: 1, created_at: NOW, actor_id: USERS.admin.id, actor_role: 'ADMIN', action: 'validate', entity_type: 'buildings', entity_id: B1, entity_label: 'Bâtiment TEST A', details: { changed_fields: ['verification_status'], changes: { verification_status: { from: 'pending', to: 'validated' } } } },
    ],
  };
}

function b64url(o) { return Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url'); }
export function fakeJwt(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, role: 'authenticated', exp, aud: 'authenticated', email: user.email })}.${b64url('sig-test')}`;
}
export function sessionFor(user) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: fakeJwt(user), refresh_token: 'refresh-test', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
    user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: { full_name: user.full_name }, created_at: NOW },
  };
}

function applyFilters(rows, params) {
  let out = rows;
  for (const [key, val] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    const m = /^(eq|is|in|neq)\.(.*)$/.exec(val);
    if (!m) continue;
    const [, op, arg] = m;
    if (op === 'eq') out = out.filter((r) => String(r[key]) === arg);
    else if (op === 'neq') out = out.filter((r) => String(r[key]) !== arg);
    else if (op === 'is') out = out.filter((r) => (arg === 'null' ? r[key] == null : String(r[key]) === arg));
    else if (op === 'in') { const set = new Set(arg.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''))); out = out.filter((r) => set.has(String(r[key]))); }
  }
  const lim = Number(params.get('limit'));
  return Number.isFinite(lim) && lim > 0 ? out.slice(0, lim) : out;
}

/**
 * Installe le faux Supabase sur un contexte Playwright.
 * options.user : null (visiteur) | 'student' | 'manager' | 'admin'.
 * Renvoie { calls, data } pour inspection (appels d'écriture enregistrés).
 */
export async function installMockSupabase(context, { user = null } = {}) {
  const data = fixtures();
  const calls = [];
  await context.route(`${SUPABASE_URL}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const json = (body, status = 200, headers = {}) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }
    if (url.pathname.startsWith('/functions/v1/')) return route.fallback(); // géré par le scénario
    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname.endsWith('/user') && user) return json(sessionFor(USERS[user]).user);
      if (url.pathname.endsWith('/token') && user) return json(sessionFor(USERS[user]));
      if (url.pathname.endsWith('/logout')) return json({}, 204);
      return json({ error: 'not_authenticated', message: 'Aucune session (test)' }, 401);
    }
    if (url.pathname.startsWith('/storage/v1/')) {
      calls.push({ method, path: url.pathname });
      return json({ Key: 'test/ok', Id: 'ok' });
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      calls.push({ method, path: url.pathname, body: req.postData() });
      return json({ buildings_created: 1, rooms_created: 0, floors_created: 0 });
    }
    const table = url.pathname.replace('/rest/v1/', '');
    if (url.pathname.startsWith('/rest/v1/') && table in data) {
      if (method === 'GET' || method === 'HEAD') {
        const rows = applyFilters(data[table], url.searchParams);
        const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
        if (wantsObject) return rows.length ? json(rows[0]) : json({ code: 'PGRST116', message: 'No rows' }, 406);
        return json(rows, 200, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
      }
      calls.push({ method, path: url.pathname, query: url.search, body: req.postData() });
      return json([], method === 'POST' ? 201 : 200);
    }
    return json({ message: `Table inconnue (fixture): ${table}` }, 404);
  });

  if (user) {
    const sess = sessionFor(USERS[user]);
    await context.addInitScript(([key, value, onboardingKey]) => { try { localStorage.setItem(key, value); localStorage.setItem(onboardingKey, '1'); } catch { /* ignore */ } }, [STORAGE_KEY, JSON.stringify(sess), `hec_onboarding_seen_${USERS[user].id}`]);
  }
  return { calls, data };
}
