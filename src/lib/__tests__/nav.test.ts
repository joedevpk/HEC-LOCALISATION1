import { describe, expect, it } from 'vitest';
import {
  distanceToPolylineMeters,
  findRoute,
  haversine,
  buildRouteGeoJSON,
} from '@/lib/nav';
import type { CampusLocation, RouteNode, RouteSegment } from '@/lib/types';

// Coordonnées autour de Kinshasa (lng ≈ 15.3, lat ≈ -4.3). 0.0001° ≈ 11 m.
const BASE_LNG = 15.3;
const BASE_LAT = -4.3;
const at = (dLng: number, dLat: number): [number, number] => [BASE_LNG + dLng, BASE_LAT + dLat];

function loc(id: string, dLng: number, dLat: number): CampusLocation {
  const [lng, lat] = at(dLng, dLat);
  return {
    id,
    building_id: null,
    floor_id: null,
    name: id,
    code: id,
    kind: 'poi',
    category: 'test',
    description: '',
    capacity: null,
    lng,
    lat,
    is_accessible: true,
  } as unknown as CampusLocation;
}

function node(id: string, dLng: number, dLat: number): RouteNode {
  const [lng, lat] = at(dLng, dLat);
  return { id, campus_id: 'c', lng, lat, name: id } as unknown as RouteNode;
}

function seg(
  id: string,
  from: string,
  to: string,
  distance: number,
  extra: Partial<RouteSegment> = {},
): RouteSegment {
  return {
    id,
    campus_id: 'c',
    from_node: from,
    to_node: to,
    distance,
    accessible: true,
    segment_type: 'path',
    ...extra,
  } as unknown as RouteSegment;
}

// Petit réseau en "Y" :   A —— B —— C
//                                \
//                                 D
const nodes = [node('A', 0, 0), node('B', 0.001, 0), node('C', 0.002, 0), node('D', 0.001, 0.001)];
const segments = [seg('s1', 'A', 'B', 110), seg('s2', 'B', 'C', 110), seg('s3', 'B', 'D', 110)];

describe('findRoute — réseau réel uniquement', () => {
  it('renvoie ROUTE_NETWORK_MISSING (et aucune ligne) sans réseau', () => {
    const out = findRoute(loc('from', 0, 0), loc('to', 0.002, 0), false, [], []);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe('ROUTE_NETWORK_MISSING');
      // La distance à vol d'oiseau n'est qu'un texte, jamais un tracé.
      expect(out.error.straightLineDistanceMeters).toBeGreaterThan(0);
    }
  });

  it('calcule A → C via B et renvoie des coordonnées [lng, lat] valides', () => {
    const out = findRoute(loc('from', 0, 0), loc('to', 0.002, 0), false, nodes, segments);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { coordinates, usedNetwork, distanceMeters } = out.route;
    expect(usedNetwork).toBe(true);
    expect(coordinates.length).toBeGreaterThanOrEqual(3);
    for (const [lng, lat] of coordinates) {
      expect(Number.isFinite(lng)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
      // Ordre MapLibre [lng, lat] : la longitude de Kinshasa est ≈ 15.
      expect(lng).toBeGreaterThan(10);
      expect(Math.abs(lat)).toBeLessThan(10);
    }
    expect(distanceMeters).toBeGreaterThan(200);
    // Passe bien par le nœud B (pas de raccourci en ligne droite).
    const b = at(0.001, 0);
    expect(coordinates.some(([lng, lat]) => lng === b[0] && lat === b[1])).toBe(true);
  });

  it('produit un LineString GeoJSON valide', () => {
    const out = findRoute(loc('from', 0, 0), loc('to', 0.002, 0), false, nodes, segments);
    if (!out.ok) throw new Error('route attendue');
    const geo = buildRouteGeoJSON(out.route);
    expect(geo.geometry.type).toBe('LineString');
    expect(geo.geometry.coordinates.length).toBeGreaterThan(1);
  });

  it('refuse un départ trop éloigné du réseau (aucune route inventée)', () => {
    const out = findRoute(loc('far', 0.05, 0.05), loc('to', 0.002, 0), false, nodes, segments);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('ROUTE_NETWORK_UNREACHABLE');
  });

  it("refuse des coordonnées d'origine invalides (NaN)", () => {
    const bad = { ...loc('bad', 0, 0), lat: Number.NaN };
    const out = findRoute(bad, loc('to', 0.002, 0), false, nodes, segments);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('INVALID_ORIGIN');
  });

  it("signale 'déjà arrivé' quand départ et arrivée se rattachent au même nœud", () => {
    const out = findRoute(loc('a', 0.00001, 0), loc('b', 0.00002, 0), false, nodes, segments);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('ROUTE_ALREADY_AT_DESTINATION');
  });
});

describe('findRoute — robustesse des données du réseau', () => {
  it('ignore un segment orphelin (nœud inexistant) sans planter', () => {
    const withOrphan = [...segments, seg('orphan', 'B', 'ZZZ', 50)];
    const out = findRoute(loc('from', 0, 0), loc('to', 0.002, 0), false, nodes, withOrphan);
    expect(out.ok).toBe(true);
  });

  it('gère une distance de segment à 0 / NaN via la vraie distance géographique', () => {
    const broken = [seg('s1', 'A', 'B', 0), seg('s2', 'B', 'C', Number.NaN), seg('s3', 'B', 'D', 110)];
    const out = findRoute(loc('from', 0, 0), loc('to', 0.002, 0), false, nodes, broken);
    expect(out.ok).toBe(true);
    if (out.ok) {
      const expected = haversine(at(0, 0), at(0.002, 0));
      expect(out.route.distanceMeters).toBeGreaterThan(expected * 0.9);
      expect(out.route.distanceMeters).toBeLessThan(expected * 1.3);
    }
  });

  it("s'accroche à un nœud connecté plutôt qu'à un nœud isolé plus proche", () => {
    // Nœud isolé "X" tout près du départ, mais relié à rien.
    const withIsolated = [...nodes, node('X', 0.00001, 0.00001)];
    const out = findRoute(loc('from', 0.00002, 0.00002), loc('to', 0.002, 0), false, withIsolated, segments);
    expect(out.ok).toBe(true);
  });

  it('en mode PMR, exclut les escaliers et signale ROUTE_NOT_FOUND s\'il n\'y a pas d\'alternative', () => {
    const stairs = [seg('s1', 'A', 'B', 110, { accessible: false, segment_type: 'stairs' }), seg('s2', 'B', 'C', 110)];
    const pmr = findRoute(loc('from', 0, 0), loc('to', 0.002, 0), true, nodes, stairs);
    expect(pmr.ok).toBe(false);
    const std = findRoute(loc('from', 0, 0), loc('to', 0.002, 0), false, nodes, stairs);
    expect(std.ok).toBe(true);
  });

  it("choisit le chemin le plus court quand deux chemins existent (A*)", () => {
    // Raccourci direct A–C beaucoup plus court que A–B–C
    const shortcut = [...segments, seg('s4', 'A', 'C', 150)];
    const out = findRoute(loc('from', 0, 0), loc('to', 0.002, 0), false, nodes, shortcut);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.route.distanceMeters).toBeLessThan(200);
  });
});

describe('distanceToPolylineMeters (détection hors-itinéraire)', () => {
  const line: [number, number][] = [at(0, 0), at(0.001, 0), at(0.002, 0)];
  it('est ~0 pour un point sur le tracé', () => {
    expect(distanceToPolylineMeters(at(0.0005, 0), line)).toBeLessThan(0.5);
  });
  it('mesure ~11 m pour un point à 0.0001° de latitude', () => {
    const d = distanceToPolylineMeters(at(0.0005, 0.0001), line);
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(13);
  });
  it('renvoie Infinity pour un tracé vide', () => {
    expect(distanceToPolylineMeters(at(0, 0), [])).toBe(Infinity);
  });
});
