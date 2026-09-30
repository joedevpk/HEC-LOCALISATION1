import type { CampusLocation, RouteNode, RouteSegment } from '@/lib/types';

// =====================================================================
// AUDIT DE L'ANCIEN SYSTÈME (ÉTAPE 5) — pour mémoire, voir aussi le
// rapport livré dans la conversation :
//
// - buildRoute() fabriquait un point intermédiaire ("bend") pour tracer
//   une ligne en L, et décrivait ce trajet inventé avec du texte
//   d'instructions ("Suivez l'allée principale...") comme s'il
//   s'agissait d'une vraie navigation. => SUPPRIMÉ.
// - buildGraphRoute() utilisait déjà un vrai graphe (route_nodes /
//   route_segments) avec Dijkstra pour le cas nominal — cette partie
//   est CONSERVÉE et améliorée (A*, tas binaire, erreurs explicites).
// - Le "fallback" en cas de réseau absent/inatteignable/chemin
//   introuvable retombait systématiquement sur le faux buildRoute() en
//   L. => SUPPRIMÉ : plus aucune ligne droite n'est fabriquée. En cas
//   d'échec, findRoute() renvoie une RouteError explicite (avec la
//   distance à vol d'oiseau en texte seulement) et rien n'est tracé.
// - "distance" et "ETA" du vrai chemin sommaient déjà les vrais
//   segments : conservé. Le repli, lui, n'affiche plus une distance de
//   segments fictifs.
// =====================================================================

export interface RouteResult {
  coordinates: [number, number][];
  /** Somme des vraies distances de segments quand usedNetwork=true ;
   * distance à vol d'oiseau (indicative) quand usedNetwork=false. */
  distanceMeters: number;
  /** Estimation piétonne — jamais une donnée exacte (cf. calculateRouteETA). */
  durationMinutes: number;
  steps: string[];
  /** true si le chemin suit le graphe reel du campus (route_nodes /
   * route_segments), false si c'est un repli en ligne directe (aucun
   * reseau de navigation saisi pour ce campus, destination trop loin de
   * tout noeud connu, ou aucun chemin trouve). L'UI doit refleter
   * honnetement cette info et ne jamais presenter le cas false comme un
   * itineraire reel. */
  usedNetwork: boolean;
}

const EARTH_RADIUS_M = 6371000;

export function haversine(
  a: [number, number],
  b: [number, number],
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

function isValidCoordinate(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * Distance minimale (mètres) entre un point et une polyligne — utilisée
 * pendant une navigation active pour détecter si l'utilisateur s'est
 * réellement écarté de l'itinéraire (section 11/12 du cahier des
 * charges), plutôt que de comparer uniquement au point de départ.
 *
 * Projection localement plane (équirectangulaire, mise à l'échelle par
 * cos(latitude) au point de référence) : à l'échelle d'un campus
 * (quelques centaines de mètres), l'erreur introduite est de l'ordre du
 * centimètre — largement négligeable face à l'incertitude GPS elle-même
 * (`accuracy`, en général ≥ 5 m). Ce n'est pas une approximation
 * dégradée qui fausserait la détection hors-itinéraire.
 */
export function distanceToPolylineMeters(
  point: [number, number],
  polyline: [number, number][],
): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversine(point, polyline[0]);

  const [pLng, pLat] = point;
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((pLat * Math.PI) / 180);
  const toXY = (p: [number, number]): [number, number] => [
    (p[0] - pLng) * metersPerDegLng,
    (p[1] - pLat) * metersPerDegLat,
  ];

  let minDistSq = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = toXY(polyline[i]);
    const b = toXY(polyline[i + 1]);
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lenSq = abx * abx + aby * aby;
    let t = lenSq > 0 ? (-a[0] * abx - a[1] * aby) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = -(a[0] + t * abx);
    const dy = -(a[1] + t * aby);
    const distSq = dx * dx + dy * dy;
    if (distSq < minDistSq) minDistSq = distSq;
  }
  return Math.sqrt(minDistSq);
}

// ---------------------------------------------------------------------
// Vitesses de marche (ÉTAPE 5, point 11) : configurées, jamais présentées
// comme des données exactes. Architecture prête pour affiner plus tard
// (escaliers, pente) quand des données réelles existeront.
// ---------------------------------------------------------------------

export interface WalkingProfile {
  /** Vitesse de marche en m/s. Valeur de référence générale, pas une
   * mesure spécifique au campus HEC. */
  speedMps: number;
}

export const WALKING_PROFILES: Record<'standard' | 'pmr', WalkingProfile> = {
  standard: { speedMps: 1.35 },
  pmr: { speedMps: 1.0 },
};

function estimateDurationMinutes(distanceMeters: number, profile: WalkingProfile): number {
  return Math.max(1, Math.round(distanceMeters / profile.speedMps / 60));
}

// ---------------------------------------------------------------------
// Résolution de la coordonnée de destination (ÉTAPE 5, point 8).
// Utilise entrance_lat/entrance_lng si le type Building les expose et
// qu'ils sont renseignés ; sinon retombe sur la coordonnée du lieu.
// N'invente jamais une entrée : tant que ces champs n'existent pas
// réellement dans types.ts, ce repli garde le comportement actuel.
// ---------------------------------------------------------------------

interface BuildingEntranceFields {
  entrance_lat?: number;
  entrance_lng?: number;
}

function resolveDestinationCoordinate(loc: CampusLocation): [number, number] {
  const building = loc.building as
    | (CampusLocation['building'] & BuildingEntranceFields)
    | undefined;
  if (
    building &&
    typeof building.entrance_lat === 'number' &&
    typeof building.entrance_lng === 'number' &&
    Number.isFinite(building.entrance_lat) &&
    Number.isFinite(building.entrance_lng)
  ) {
    return [building.entrance_lng, building.entrance_lat];
  }
  return [loc.lng, loc.lat];
}

// ---------------------------------------------------------------------
// Erreurs explicites (ÉTAPE 5, point 17). Aucune de ces situations ne
// doit produire une route fabriquée : l'appelant décide comment
// afficher l'échec (message, repli visuel explicite, etc.).
// ---------------------------------------------------------------------

export type RouteErrorCode =
  | 'ROUTE_NOT_FOUND'
  | 'ROUTE_NETWORK_MISSING'
  | 'ROUTE_NETWORK_UNREACHABLE'
  | 'ROUTE_ALREADY_AT_DESTINATION'
  | 'INVALID_ORIGIN'
  | 'INVALID_DESTINATION';

export interface RouteError {
  code: RouteErrorCode;
  message: string;
  /** Distance à vol d'oiseau, fournie seulement à titre indicatif quand
   * aucun itinéraire réel n'a pu être calculé. */
  straightLineDistanceMeters?: number;
}

export type RouteOutcome =
  | { ok: true; route: RouteResult }
  | { ok: false; error: RouteError };

// ---------------------------------------------------------------------
// Nearest node (ÉTAPE 5, point 6) — vraie distance géographique,
// aucun choix arbitraire.
// ---------------------------------------------------------------------

export interface NearestNodeResult {
  node: RouteNode;
  distanceMeters: number;
}

// Un point est "rattaché" au réseau seulement s'il existe un nœud à
// moins de 60 m — au-delà on considère que le réseau ne couvre pas
// cette zone et on le signale honnêtement plutôt que de forcer un
// rattachement absurde.
const MAX_SNAP_DISTANCE_M = 60;

export function findNearestRouteNode(
  point: [number, number],
  nodes: RouteNode[],
): NearestNodeResult | null {
  if (nodes.length === 0) return null;
  let best: NearestNodeResult | null = null;
  for (const node of nodes) {
    const d = haversine(point, [node.lng, node.lat]);
    if (!best || d < best.distanceMeters) best = { node, distanceMeters: d };
  }
  return best;
}

// ---------------------------------------------------------------------
// Graphe (ÉTAPE 5, points 3-4) — construit uniquement à partir des
// route_nodes / route_segments réellement fournis. Le coût d'un
// segment est sa distance réelle. En mode PMR, les segments non
// accessibles sont exclus du graphe plutôt que pénalisés arbitrairement
// (on ne "presque interdit" pas un escalier : on ne le propose pas).
// ---------------------------------------------------------------------

interface Edge {
  to: string;
  weight: number;
  segment: RouteSegment;
}

interface Graph {
  adjacency: Map<string, Edge[]>;
}

function buildGraph(nodes: RouteNode[], segments: RouteSegment[], accessible: boolean): Graph {
  const adjacency = new Map<string, Edge[]>();
  const nodeById = new Map<string, RouteNode>();
  for (const n of nodes) {
    // Un nœud sans coordonnées valides ne peut pas participer au calcul.
    if (!isValidCoordinate(n.lng, n.lat)) continue;
    adjacency.set(n.id, []);
    nodeById.set(n.id, n);
  }
  for (const seg of segments) {
    if (accessible && !seg.accessible) continue;
    const a = nodeById.get(seg.from_node);
    const b = nodeById.get(seg.to_node);
    // Segment orphelin (référence inexistante) ou boucle sur lui-même :
    // ignoré, jamais "réparé" avec une donnée inventée.
    if (!a || !b || a.id === b.id) continue;
    // Distance enregistrée absente / 0 / NaN : on utilise la vraie
    // distance géographique entre les deux nœuds plutôt qu'un coût nul
    // qui fausserait A* (chemin "gratuit") ou un NaN qui le casserait.
    const weight =
      Number.isFinite(seg.distance) && seg.distance > 0
        ? seg.distance
        : haversine([a.lng, a.lat], [b.lng, b.lat]);
    adjacency.get(a.id)!.push({ to: b.id, weight, segment: seg });
    // Réseau piéton non orienté sauf mention contraire dans les données.
    adjacency.get(b.id)!.push({ to: a.id, weight, segment: seg });
  }
  return { adjacency };
}

function findEdge(graph: Graph, fromId: string, toId: string): Edge | undefined {
  return graph.adjacency.get(fromId)?.find((e) => e.to === toId);
}

// ---------------------------------------------------------------------
// Tas binaire minimal pour A* (ÉTAPE 5, point 16 — performance : évite
// le scan linéaire de tous les nœuds à chaque itération, important dès
// que le réseau atteint plusieurs centaines/milliers de nœuds).
// ---------------------------------------------------------------------

class MinHeap<T> {
  private heap: { priority: number; value: T }[] = [];

  get size(): number {
    return this.heap.length;
  }

  push(value: T, priority: number): void {
    this.heap.push({ value, priority });
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].priority <= this.heap[i].priority) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      let i = 0;
      const n = this.heap.length;
      for (;;) {
        const left = i * 2 + 1;
        const right = i * 2 + 2;
        let smallest = i;
        if (left < n && this.heap[left].priority < this.heap[smallest].priority) smallest = left;
        if (right < n && this.heap[right].priority < this.heap[smallest].priority) smallest = right;
        if (smallest === i) break;
        [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
        i = smallest;
      }
    }
    return top.value;
  }
}

/**
 * A* : Dijkstra + heuristique = distance à vol d'oiseau jusqu'au nœud
 * d'arrivée. Avantage réel ici puisque chaque nœud a des coordonnées
 * géographiques connues, ce qui guide la recherche vers la
 * destination au lieu d'explorer le graphe dans toutes les directions.
 * Déterministe, indépendant de React/MapLibre, testable en isolation.
 */
function aStar(
  graph: Graph,
  nodeById: Map<string, RouteNode>,
  startId: string,
  endId: string,
): string[] | null {
  const goal = nodeById.get(endId);
  if (!goal || !graph.adjacency.has(startId) || !graph.adjacency.has(endId)) return null;

  const heuristic = (id: string): number => {
    const n = nodeById.get(id);
    if (!n) return 0;
    return haversine([n.lng, n.lat], [goal.lng, goal.lat]);
  };

  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const visited = new Set<string>();
  const open = new MinHeap<string>();

  gScore.set(startId, 0);
  open.push(startId, heuristic(startId));

  while (open.size > 0) {
    const current = open.pop();
    if (current === undefined) break;
    if (visited.has(current)) continue;
    visited.add(current);
    if (current === endId) break;

    for (const edge of graph.adjacency.get(current) ?? []) {
      if (visited.has(edge.to)) continue;
      const tentative = (gScore.get(current) ?? Infinity) + edge.weight;
      if (tentative < (gScore.get(edge.to) ?? Infinity)) {
        gScore.set(edge.to, tentative);
        cameFrom.set(edge.to, current);
        open.push(edge.to, tentative + heuristic(edge.to));
      }
    }
  }

  if (!gScore.has(endId)) return null;

  const path: string[] = [endId];
  let cur = endId;
  while (cur !== startId) {
    const prev = cameFrom.get(cur);
    if (!prev) return null;
    path.unshift(prev);
    cur = prev;
  }
  return path;
}

function describeSegmentType(type: RouteSegment['segment_type']): string | null {
  switch (type) {
    case 'stairs':
      return "Empruntez l'escalier.";
    case 'elevator':
      return "Prenez l'ascenseur.";
    case 'ramp':
      return 'Suivez la rampe.';
    case 'corridor':
      return 'Suivez le couloir.';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------
// Cœur du moteur : calcule un itinéraire réel ou renvoie une erreur
// explicite. Ne fabrique jamais de chemin — c'est l'appelant qui
// choisit comment afficher un échec (ROUTE_NOT_FOUND, etc.).
// ---------------------------------------------------------------------

function computeRoute(
  from: CampusLocation,
  to: CampusLocation,
  accessible: boolean,
  nodes: RouteNode[],
  segments: RouteSegment[],
  graph?: Graph,
): RouteOutcome {
  if (!isValidCoordinate(from.lng, from.lat)) {
    return {
      ok: false,
      error: { code: 'INVALID_ORIGIN', message: "Coordonnées d'origine invalides." },
    };
  }

  const destCoord = resolveDestinationCoordinate(to);
  if (!isValidCoordinate(destCoord[0], destCoord[1])) {
    return {
      ok: false,
      error: { code: 'INVALID_DESTINATION', message: 'Coordonnées de destination invalides.' },
    };
  }

  const originCoord: [number, number] = [from.lng, from.lat];
  const straightLineDistanceMeters = haversine(originCoord, destCoord);

  if (nodes.length === 0 || segments.length === 0) {
    return {
      ok: false,
      error: {
        code: 'ROUTE_NETWORK_MISSING',
        message: "Le réseau de navigation (route_nodes / route_segments) n'est pas encore renseigné.",
        straightLineDistanceMeters,
      },
    };
  }

  const g = graph ?? buildGraph(nodes, segments, accessible);
  // On ne s'accroche qu'à des nœuds réellement connectés à au moins un
  // segment utilisable : un nœud isolé (ou uniquement relié par des
  // escaliers en mode PMR) rendrait le calcul impossible alors qu'un
  // nœud voisin, lui, fonctionne.
  const connectedNodes = nodes.filter((n) => (g.adjacency.get(n.id)?.length ?? 0) > 0);
  if (connectedNodes.length === 0) {
    return {
      ok: false,
      error: {
        code: accessible ? 'ROUTE_NOT_FOUND' : 'ROUTE_NETWORK_MISSING',
        message: accessible
          ? "Aucun segment accessible PMR n'est renseigné dans le réseau."
          : "Aucun segment valide n'est renseigné dans le réseau de navigation.",
        straightLineDistanceMeters,
      },
    };
  }
  const start = findNearestRouteNode(originCoord, connectedNodes);
  const end = findNearestRouteNode(destCoord, connectedNodes);

  if (!start || !end || start.distanceMeters > MAX_SNAP_DISTANCE_M || end.distanceMeters > MAX_SNAP_DISTANCE_M) {
    return {
      ok: false,
      error: {
        code: 'ROUTE_NETWORK_UNREACHABLE',
        message: "Aucun nœud du réseau n'est assez proche de l'origine ou de la destination.",
        straightLineDistanceMeters,
      },
    };
  }

  if (start.node.id === end.node.id) {
    // Origine et destination se rattachent au même nœud du réseau : elles
    // sont déjà à quelques mètres l'une de l'autre. Aucun tracé n'est
    // fabriqué pour ce cas — on le dit simplement.
    return {
      ok: false,
      error: {
        code: 'ROUTE_ALREADY_AT_DESTINATION',
        message: 'Vous êtes déjà à proximité immédiate de la destination.',
        straightLineDistanceMeters,
      },
    };
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const path = aStar(g, nodeById, start.node.id, end.node.id);

  if (!path || path.length < 2) {
    return {
      ok: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: accessible
          ? "Aucun chemin accessible PMR n'a été trouvé entre ces deux points."
          : "Aucun chemin n'a été trouvé entre ces deux points dans le réseau.",
        straightLineDistanceMeters,
      },
    };
  }

  const coordinates: [number, number][] = [
    originCoord,
    ...path.map((id) => {
      const n = nodeById.get(id)!;
      return [n.lng, n.lat] as [number, number];
    }),
    destCoord,
  ];

  let distanceMeters = haversine(originCoord, [start.node.lng, start.node.lat]);
  const steps: string[] = [`Départ depuis ${from.name}.`];
  const segmentTypesSeen = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    const a = nodeById.get(path[i])!;
    const b = nodeById.get(path[i + 1])!;
    const edge = findEdge(g, a.id, b.id) ?? findEdge(g, b.id, a.id);
    distanceMeters += edge?.weight ?? haversine([a.lng, a.lat], [b.lng, b.lat]);
    if (edge) {
      const desc = describeSegmentType(edge.segment.segment_type);
      if (desc && !segmentTypesSeen.has(edge.segment.segment_type)) {
        segmentTypesSeen.add(edge.segment.segment_type);
        steps.push(desc);
      }
    }
  }
  distanceMeters += haversine([end.node.lng, end.node.lat], destCoord);
  steps.push(`Vous êtes arrivé à ${to.name}.`);

  const profile = accessible ? WALKING_PROFILES.pmr : WALKING_PROFILES.standard;
  const durationMinutes = estimateDurationMinutes(distanceMeters, profile);

  return {
    ok: true,
    route: { coordinates, distanceMeters, durationMinutes, steps, usedNetwork: true },
  };
}

/**
 * API "explicite" (ÉTAPE 5, point 19) : ne masque jamais un échec
 * derrière une fausse route. À privilégier pour toute nouvelle
 * intégration (ex. RoutePanel.tsx pourra migrer vers cette fonction
 * plus tard sans que ce fichier n'ait besoin d'être retouché ici).
 */
export function findRoute(
  from: CampusLocation,
  to: CampusLocation,
  accessible: boolean,
  nodes: RouteNode[],
  segments: RouteSegment[],
): RouteOutcome {
  return computeRoute(from, to, accessible, nodes, segments);
}

export function calculateRouteDistance(route: RouteResult): number {
  return route.distanceMeters;
}

/**
 * Recalcule l'ETA pour un profil de marche donné (standard par défaut).
 * Toujours une estimation — jamais présentée comme une donnée exacte.
 */
export function calculateRouteETA(
  route: RouteResult,
  profile: WalkingProfile = WALKING_PROFILES.standard,
): number {
  return estimateDurationMinutes(route.distanceMeters, profile);
}

// ---------------------------------------------------------------------
// GeoJSON (ÉTAPE 5, point 12)
// ---------------------------------------------------------------------

export interface RouteGeoJSON {
  type: 'Feature';
  properties: {
    distanceMeters: number;
    durationMinutes: number;
    usedNetwork: boolean;
  };
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

export function buildRouteGeoJSON(route: RouteResult): RouteGeoJSON {
  return {
    type: 'Feature',
    properties: {
      distanceMeters: route.distanceMeters,
      durationMinutes: route.durationMinutes,
      usedNetwork: route.usedNetwork,
    },
    geometry: {
      type: 'LineString',
      coordinates: route.coordinates,
    },
  };
}

// ---------------------------------------------------------------------
// Moteur avec état (ÉTAPE 5, points 14 & 19) : cache le graphe pour
// éviter de le reconstruire à chaque recherche (performance), et garde
// la dernière route calculée pour permettre clearRoute()/
// recalculateRoute(). Indépendant de React et de MapLibre : le
// composant appelant lit getCurrentRoute() pour savoir quoi dessiner.
// ---------------------------------------------------------------------

export class RouteEngine {
  private nodes: RouteNode[] = [];
  private segments: RouteSegment[] = [];
  private graphStandard: Graph | null = null;
  private graphAccessible: Graph | null = null;
  private currentRoute: RouteResult | null = null;
  private currentDestination: CampusLocation | null = null;
  private currentAccessible = false;

  /** À appeler quand route_nodes / route_segments sont (re)chargés. */
  setNetwork(nodes: RouteNode[], segments: RouteSegment[]): void {
    this.nodes = nodes;
    this.segments = segments;
    this.graphStandard = null;
    this.graphAccessible = null;
  }

  hasNetwork(): boolean {
    return this.nodes.length > 0 && this.segments.length > 0;
  }

  private getGraph(accessible: boolean): Graph {
    if (accessible) {
      if (!this.graphAccessible) this.graphAccessible = buildGraph(this.nodes, this.segments, true);
      return this.graphAccessible;
    }
    if (!this.graphStandard) this.graphStandard = buildGraph(this.nodes, this.segments, false);
    return this.graphStandard;
  }

  findNearestRouteNode(point: [number, number]): NearestNodeResult | null {
    return findNearestRouteNode(point, this.nodes);
  }

  findRoute(from: CampusLocation, to: CampusLocation, accessible: boolean): RouteOutcome {
    const outcome = computeRoute(from, to, accessible, this.nodes, this.segments, this.getGraph(accessible));
    if (outcome.ok) {
      this.currentRoute = outcome.route;
      this.currentDestination = to;
      this.currentAccessible = accessible;
    }
    return outcome;
  }

  /** Recalcule depuis une nouvelle origine (ex. l'utilisateur a quitté
   * le chemin), vers la même destination que la dernière recherche. */
  recalculateRoute(newOrigin: CampusLocation): RouteOutcome {
    if (!this.currentDestination) {
      return {
        ok: false,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: "Aucune destination active à recalculer : appelez findRoute() d'abord.",
        },
      };
    }
    return this.findRoute(newOrigin, this.currentDestination, this.currentAccessible);
  }

  clearRoute(): void {
    this.currentRoute = null;
    this.currentDestination = null;
  }

  getCurrentRoute(): RouteResult | null {
    return this.currentRoute;
  }
}

// Instance partagée, prête à l'emploi pour un futur hook "Ma position"
// / RoutePanel.tsx (non câblée ici : ces fichiers ne sont pas modifiés).
export const routeEngine = new RouteEngine();

// =====================================================================
// Recherche floue (déjà livrée précédemment — INCHANGÉE dans cette
// étape, qui ne porte que sur le moteur de routing).
// =====================================================================

function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function levenshteinBounded(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function typoTolerance(wordLength: number): number {
  if (wordLength <= 3) return 0;
  if (wordLength <= 6) return 1;
  return 2;
}

function fuzzyTokenInText(token: string, text: string): boolean {
  if (text.includes(token)) return true;
  const tolerance = typoTolerance(token.length);
  if (tolerance === 0) return false;
  for (const word of text.split(/\s+/)) {
    if (Math.abs(word.length - token.length) > tolerance) continue;
    if (levenshteinBounded(token, word, tolerance) <= tolerance) return true;
  }
  return false;
}

export function scoreMatch(location: CampusLocation, query: string): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const name = normalizeText(location.name);
  const code = normalizeText(location.code);
  const fields = normalizeText(
    [
      location.name,
      location.code,
      location.category,
      location.building?.name ?? '',
      location.building?.code ?? '',
      location.description,
    ].join(' '),
  );
  if (name === q) return 100;
  if (code === q) return 95;
  if (name.startsWith(q)) return 80;
  if (code.startsWith(q)) return 78;
  if (fields.includes(q)) return 55;
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return 0;
  const exactHits = tokens.filter((t) => fields.includes(t)).length;
  if (exactHits > 0) return 20 + exactHits * 8;
  const fuzzyHits = tokens.filter((t) => fuzzyTokenInText(t, fields)).length;
  if (fuzzyHits > 0) return 10 + fuzzyHits * 5;
  return 0;
}

export function searchLocations(
  locations: CampusLocation[],
  query: string,
): CampusLocation[] {
  if (!query.trim()) return [];
  return locations
    .map((loc) => ({ loc, score: scoreMatch(loc, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.loc);
}

export function suggestClosestLocation(
  locations: CampusLocation[],
  query: string,
): CampusLocation | null {
  const q = normalizeText(query);
  if (!q || q.length < 3) return null;
  let best: { loc: CampusLocation; dist: number } | null = null;
  for (const loc of locations) {
    const dist = levenshteinBounded(q, normalizeText(loc.name), 4);
    if (dist <= 4 && (!best || dist < best.dist)) best = { loc, dist };
  }
  if (best && best.dist <= Math.max(2, Math.ceil(q.length * 0.4))) return best.loc;
  return null;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}