import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_BBOX,
  SlidingWindowLimiter,
  buildOrsBody,
  classifyOrsFailure,
  corsOriginFor,
  parseBbox,
  validateOrsSuccess,
  validateRequest,
} from '../../../supabase/supabase/functions/route-walking/core';

const A = [15.3, -4.32];
const B = [15.31, -4.33];

describe('proxy — validation de la demande', () => {
  it('accepte un trajet valide à Kinshasa', () => {
    const r = validateRequest({ from: A, to: B });
    expect(r.ok).toBe(true);
  });
  it.each([
    ['null', null],
    ['tableau', []],
    ['texte', 'x'],
    ['sans points', {}],
    ['from manquant', { to: B }],
    ['NaN', { from: [NaN, -4.3], to: B }],
    ['chaînes', { from: ['15.3', '-4.3'], to: B }],
    ['3 valeurs', { from: [15.3, -4.3, 5], to: B }],
    ['latitude hors plage', { from: [15.3, -91], to: B }],
    ['longitude hors plage', { from: [181, -4.3], to: B }],
    ['île nulle (0,0)', { from: [0, 0], to: B }],
  ])('refuse des coordonnées invalides : %s', (_n, body) => {
    const r = validateRequest(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.status).toBe(400);
  });
  it('refuse un départ identique à l’arrivée', () => {
    const r = validateRequest({ from: A, to: A });
    expect(r.ok).toBe(false);
  });
  it('refuse hors zone (out_of_area, 422) sauf si la restriction est levée', () => {
    const paris = { from: [2.35, 48.85], to: [2.36, 48.86] };
    const r = validateRequest(paris);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toMatchObject({ status: 422, kind: 'out_of_area' });
    expect(validateRequest(paris, null).ok).toBe(true);
  });
  it('refuse un trajet de plus de 25 km (too_far)', () => {
    const r = validateRequest({ from: [15.3, -4.3], to: [15.7, -4.3] }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.kind).toBe('too_far');
  });
  it('ne transmet à ORS que des champs construits côté serveur', () => {
    const v = validateRequest({ from: A, to: B, profile: 'driving-car', api_key: 'pirate', extra: 1 });
    expect(v.ok).toBe(true);
    if (v.ok) {
      const body = buildOrsBody(v.from, v.to);
      expect(Object.keys(body).sort()).toEqual(['coordinates', 'instructions', 'language']);
      expect(JSON.stringify(body)).not.toContain('pirate');
    }
  });
  it('parseBbox : défaut, valeur explicite, désactivation, valeur invalide', () => {
    expect(parseBbox(undefined)).toEqual(DEFAULT_BBOX);
    expect(parseBbox('15,-5,16,-4')).toEqual([15, -5, 16, -4]);
    expect(parseBbox('none')).toBeNull();
    expect(parseBbox('15,-5,16')).toEqual(DEFAULT_BBOX);
    expect(parseBbox('16,-5,15,-4')).toEqual(DEFAULT_BBOX);
  });
});

describe('proxy — erreurs HTTP d’ORS', () => {
  it('401/403 : erreur de configuration serveur, sans recopier le corps d’ORS', () => {
    for (const s of [401, 403]) {
      const f = classifyOrsFailure(s, { error: 'Access to this API has been disallowed (key sk-SECRET)' });
      expect(f.kind).toBe('service_misconfigured');
      expect(f.status).toBe(502);
      expect(JSON.stringify(f)).not.toContain('SECRET');
    }
  });
  it('429 : quota, avec Retry-After', () => {
    expect(classifyOrsFailure(429, {}, '30')).toMatchObject({ status: 429, kind: 'rate_limited', retryAfterSeconds: 30 });
    expect(classifyOrsFailure(429, {}, null).retryAfterSeconds).toBe(60);
  });
  it('404 / code 2010 : aucun chemin (≠ panne)', () => {
    expect(classifyOrsFailure(404, { error: { code: 2010, message: 'Could not find routable point within a radius of 350.0 meters' } }).kind).toBe('no_route');
    expect(classifyOrsFailure(404, {}).kind).toBe('no_route');
  });
  it('code 2004 : trop long', () => {
    expect(classifyOrsFailure(400, { error: { code: 2004, message: 'Request parameters exceed the server configuration limits' } }).kind).toBe('too_far');
  });
  it('400 autre : requête refusée, jamais présentée comme « aucun chemin »', () => {
    const f = classifyOrsFailure(400, { error: { code: 2003, message: 'x' } });
    expect(f.kind).toBe('bad_request');
    expect(f.kind).not.toBe('no_route');
  });
  it('5xx : indisponible', () => {
    expect(classifyOrsFailure(503, undefined)).toMatchObject({ status: 503, kind: 'upstream_unavailable' });
  });
  it('un 200 sans géométrie n’est jamais renvoyé comme itinéraire', () => {
    expect(validateOrsSuccess({})).not.toBeNull();
    expect(validateOrsSuccess({ features: [{ geometry: { coordinates: [[1, 2]] } }] })).not.toBeNull();
    expect(validateOrsSuccess({ features: [{ geometry: { coordinates: [[15.3, -4.3], [15.31, -4.31]] } }] })).toBeNull();
  });
});

describe('proxy — limitation de débit', () => {
  it('limite par client puis libère après la fenêtre', () => {
    const l = new SlidingWindowLimiter(2, 100, 60_000);
    expect(l.check('ip1', 0).allowed).toBe(true);
    expect(l.check('ip1', 1000).allowed).toBe(true);
    const third = l.check('ip1', 2000);
    expect(third.allowed).toBe(false);
    if (!third.allowed) {
      expect(third.scope).toBe('client');
      expect(third.retryAfterSeconds).toBeGreaterThan(0);
    }
    expect(l.check('ip2', 2000).allowed).toBe(true); // un autre client n'est pas pénalisé
    expect(l.check('ip1', 61_000).allowed).toBe(true); // la fenêtre a glissé
  });
  it('plafond global pour protéger le quota ORS', () => {
    const l = new SlidingWindowLimiter(10, 3, 60_000);
    expect(l.check('a', 0).allowed).toBe(true);
    expect(l.check('b', 0).allowed).toBe(true);
    expect(l.check('c', 0).allowed).toBe(true);
    const r = l.check('d', 0);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.scope).toBe('global');
  });
});

describe('proxy — CORS et secrets', () => {
  it('seules les origines listées sont autorisées ; aucune liste = refus', () => {
    expect(corsOriginFor('https://localisationhec.onrender.com', 'https://localisationhec.onrender.com, http://localhost:5173')).toBe('https://localisationhec.onrender.com');
    expect(corsOriginFor('https://evil.example', 'https://localisationhec.onrender.com')).toBeNull();
    expect(corsOriginFor('https://x', undefined)).toBeNull();
    expect(corsOriginFor(null, 'https://x')).toBeNull();
  });
  it('le code de la fonction ne contient aucune clé ORS en dur et ne journalise pas de secret', () => {
    const dir = 'supabase/supabase/functions/route-walking/';
    for (const f of ['core.ts', 'index.ts']) {
      const src = readFileSync(dir + f, 'utf8');
      expect(src).not.toMatch(/console\.(log|error|warn|info)/);
      expect(src).not.toMatch(/5b3ce[0-9a-f]{20,}/i);
    }
    const idx = readFileSync(dir + 'index.ts', 'utf8');
    expect(idx).toContain("Deno.env.get('ORS_API_KEY')");
  });
  it('le client navigateur ne référence jamais ORS_API_KEY', () => {
    const client = readFileSync('src/lib/walking-route.ts', 'utf8');
    expect(client).not.toContain('ORS_API_KEY');
  });
});
