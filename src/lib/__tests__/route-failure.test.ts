import { describe, expect, it } from 'vitest';
import { describeRouteFailure } from '../route-failure';
import { readFileSync } from 'node:fs';
import type { WalkingRouteErrorKind } from '../walking-route';

// Liste exhaustive : si un nouveau type est ajouté à WalkingRouteErrorKind sans être ajouté ici,
// la vérification de source ci-dessous échoue et force à choisir sa catégorie.
const KINDS: WalkingRouteErrorKind[] = [
  'not_configured', 'invalid_points', 'too_far', 'no_route', 'forbidden', 'rate_limited', 'timeout', 'abort',
  'network_error', 'service_unavailable', 'bad_request', 'out_of_area', 'invalid_response',
];

describe('présentation des échecs d’itinéraire', () => {
  it('la liste de test couvre exactement les types déclarés dans walking-route.ts', () => {
    const src = readFileSync('src/lib/walking-route.ts', 'utf8');
    const block = src.slice(src.indexOf('export type WalkingRouteErrorKind'), src.indexOf('export class WalkingRouteError'));
    const declared = [...block.matchAll(/\|\s*'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(declared).toEqual([...KINDS].sort());
  });
  it.each([
    ['network_error', 'network', true],
    ['timeout', 'network', true],
    ['service_unavailable', 'unavailable', true],
    ['rate_limited', 'unavailable', true],
    ['invalid_response', 'unavailable', true],
    ['not_configured', 'configuration', false],
    ['forbidden', 'configuration', false],
    ['bad_request', 'configuration', false],
    ['no_route', 'not_found', false],
    ['out_of_area', 'not_found', false],
    ['too_far', 'not_found', false],
    ['invalid_points', 'not_found', false],
  ] as const)('%s → catégorie %s, relance possible : %s', (kind, category, retryable) => {
    const v = describeRouteFailure(kind);
    expect(v.category).toBe(category);
    expect(v.retryable).toBe(retryable);
    expect(v.title.length).toBeGreaterThan(5);
    expect(v.hint.length).toBeGreaterThan(5);
  });
  it('un problème de configuration n’est jamais présenté comme réessayable ni comme « réseau »', () => {
    for (const k of ['not_configured', 'forbidden', 'bad_request'] as const) {
      const v = describeRouteFailure(k);
      expect(v.retryable).toBe(false);
      expect(v.title).not.toMatch(/réseau/i);
    }
  });
  it('« aucun itinéraire » ne propose pas de relance identique et invite à changer de point', () => {
    const v = describeRouteFailure('no_route');
    expect(v.retryable).toBe(false);
    expect(v.hint).toMatch(/autre/i);
  });
  it('les six états demandés ont des titres distincts', () => {
    const titles = new Set([
      describeRouteFailure('network_error').title,
      describeRouteFailure('service_unavailable').title,
      describeRouteFailure('not_configured').title,
      describeRouteFailure('no_route').title,
      describeRouteFailure('campus_network').title,
    ]);
    expect(titles.size).toBe(5);
  });
  it('type inconnu ou absent : message générique, jamais de faux succès', () => {
    expect(describeRouteFailure(undefined).category).toBe('generic');
    expect(describeRouteFailure('abort' as WalkingRouteErrorKind).category).toBe('generic');
  });
});
