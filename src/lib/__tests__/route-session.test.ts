import { describe, expect, it } from 'vitest';
import type { RouteResult } from '@/lib/nav';
import {
  decideOnFailure,
  decideOnRecompute,
  routeForDestination,
  staleRouteWarning,
} from '@/lib/route-session';

const route = {
  coordinates: [[15.3, -4.3], [15.31, -4.31]],
  distanceMeters: 1234,
  durationMinutes: 16,
  steps: [],
  usedNetwork: true,
  source: 'external',
} as unknown as RouteResult;

const tagA = { destId: 'A', origin: [15.3, -4.3] as [number, number] };

describe('route-session — cohérence tracé / destination', () => {
  it('affiche le tracé pour sa destination', () => {
    expect(routeForDestination(route, tagA, 'A')).toBe(route);
  });
  it("n'affiche jamais le tracé d'une autre destination", () => {
    expect(routeForDestination(route, tagA, 'B')).toBeNull();
  });
  it('sans étiquette ou sans destination : aucun tracé', () => {
    expect(routeForDestination(route, null, 'A')).toBeNull();
    expect(routeForDestination(route, tagA, null)).toBeNull();
    expect(routeForDestination(null, tagA, 'A')).toBeNull();
  });
  const near: [number, number] = [15.30001, -4.30001]; // ~1,5 m : même départ
  const far: [number, number] = [15.31, -4.31]; // ~1,5 km : autre départ
  it('recalcul : tracé gardé UNIQUEMENT pour le même couple départ-destination', () => {
    expect(decideOnRecompute(tagA, 'A', near)).toBe('keep-previous');
    expect(decideOnRecompute(tagA, 'A', far)).toBe('clear');
    expect(decideOnRecompute(tagA, 'B', near)).toBe('clear');
    expect(decideOnRecompute(null, 'A', near)).toBe('clear');
  });
  it('échec : conserve un tracé valide du même couple avec avertissement, sinon erreur', () => {
    expect(decideOnFailure(tagA, 'A', near)).toBe('keep-previous-with-warning');
    expect(decideOnFailure(tagA, 'A', far)).toBe('show-error');
    expect(decideOnFailure(tagA, 'B', near)).toBe('show-error');
    expect(decideOnFailure(null, 'A', near)).toBe('show-error');
  });
  it("l'avertissement reprend la vraie cause", () => {
    const w = staleRouteWarning("Quota du service d'itinéraire atteint.");
    expect(w).toContain('Quota');
    expect(w).toContain('dernier calcul réussi');
  });
});
