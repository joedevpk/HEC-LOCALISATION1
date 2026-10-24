/* ============================================================================
 * campus-audit.ts — contrôles de cohérence des données géographiques du
 * campus (bâtiments, lieux, réseau piéton). Logique PURE : elle ne modifie
 * rien, ne corrige rien, n'invente aucune donnée. Elle produit un rapport
 * que l'administration utilise pour compléter / corriger les données.
 *
 * Utilisée par scripts/audit-campus-data.ts (lecture seule de Supabase).
 * ========================================================================= */
import { haversine } from '@/lib/nav';
import { isValidCoordinates, isNullIsland } from '@/lib/geo-validation';

export type AuditSeverity = 'critique' | 'important' | 'info';

export interface AuditFinding {
  severity: AuditSeverity;
  code: string;
  message: string;
  /** Identifiants concernés (pour retrouver la ligne en base). */
  ids: string[];
}

interface Pt {
  id: string;
  lat: number;
  lng: number;
}

export interface AuditInput {
  campus: { center_lat: number; center_lng: number };
  buildings: Array<{ id: string; name: string; code: string; center_lat: number; center_lng: number; archived_at?: string | null }>;
  locations: Array<{ id: string; name: string; kind: string; building_id: string | null; lat: number; lng: number; archived_at?: string | null }>;
  nodes: Array<{ id: string; lat: number; lng: number; archived_at?: string | null }>;
  segments: Array<{ id: string; from_node: string; to_node: string; distance: number; archived_at?: string | null }>;
}

export interface AuditOptions {
  /** Rayon (m) autour du centre du campus au-delà duquel un point est suspect. */
  maxRadiusM?: number;
  /** Deux points plus proches que ce seuil (m) sont signalés comme doublons probables. */
  duplicateM?: number;
  /** Distance max (m) entre une entrée/un lieu et le nœud de réseau le plus proche. */
  maxSnapM?: number;
  /** Écart relatif toléré entre `distance` d'un segment et la distance réelle entre ses nœuds. */
  segmentTolerance?: number;
}

const DEFAULTS: Required<AuditOptions> = {
  maxRadiusM: 1500,
  duplicateM: 1,
  maxSnapM: 60,
  segmentTolerance: 0.5,
};

const d = (a: Pt, b: Pt) => haversine([a.lng, a.lat], [b.lng, b.lat]);

function badCoord(lat: unknown, lng: unknown): boolean {
  return !isValidCoordinates(lat, lng) || isNullIsland(lat as number, lng as number);
}

/** Identifiants fixes des données d'exemple insérées par la migration d'amorçage. */
export const DEMO_SEED_IDS = new Set([
  '00000000-0000-4000-a000-000000000b01', // bâtiment « Bâtiment Informatique »
  '00000000-0000-4000-a000-000000000e01', // entrée
  '00000000-0000-4000-a000-000000000101', // salle « Salle Jumelle 1 »
]);

export function auditCampusData(input: AuditInput, options: AuditOptions = {}): AuditFinding[] {
  const o = { ...DEFAULTS, ...options };
  const out: AuditFinding[] = [];
  const add = (severity: AuditSeverity, code: string, message: string, ids: string[]) => {
    if (ids.length > 0) out.push({ severity, code, message, ids });
  };

  const active = <T extends { archived_at?: string | null }>(rows: T[]) => rows.filter((r) => !r.archived_at);
  const buildings = active(input.buildings);
  const locations = active(input.locations);
  const nodes = active(input.nodes);
  const segments = active(input.segments);

  if (badCoord(input.campus.center_lat, input.campus.center_lng)) {
    add('critique', 'CAMPUS_COORD_INVALID', 'Le centre du campus a des coordonnées invalides ou (0,0).', ['campus']);
    return out; // sans centre valide, les contrôles de distance n'ont pas de sens
  }
  const center: Pt = { id: 'campus', lat: input.campus.center_lat, lng: input.campus.center_lng };

  // 1. Coordonnées invalides
  const bPts: Pt[] = [];
  const badB: string[] = [];
  for (const b of buildings) {
    if (badCoord(b.center_lat, b.center_lng)) badB.push(b.id);
    else bPts.push({ id: b.id, lat: b.center_lat, lng: b.center_lng });
  }
  add('critique', 'BUILDING_COORD_INVALID', 'Bâtiments avec coordonnées invalides ou (0,0).', badB);

  const lPts: Pt[] = [];
  const badL: string[] = [];
  for (const l of locations) {
    if (badCoord(l.lat, l.lng)) badL.push(l.id);
    else lPts.push({ id: l.id, lat: l.lat, lng: l.lng });
  }
  add('critique', 'LOCATION_COORD_INVALID', 'Lieux avec coordonnées invalides ou (0,0).', badL);

  const nPts: Pt[] = [];
  const badN: string[] = [];
  for (const n of nodes) {
    if (badCoord(n.lat, n.lng)) badN.push(n.id);
    else nPts.push({ id: n.id, lat: n.lat, lng: n.lng });
  }
  add('critique', 'NODE_COORD_INVALID', 'Nœuds du réseau avec coordonnées invalides ou (0,0).', badN);

  // 2. Hors zone attendue (signalé, jamais déplacé)
  const far = (pts: Pt[]) => pts.filter((p) => d(center, p) > o.maxRadiusM).map((p) => p.id);
  add('important', 'BUILDING_FAR', `Bâtiments à plus de ${o.maxRadiusM} m du centre du campus.`, far(bPts));
  add('important', 'LOCATION_FAR', `Lieux à plus de ${o.maxRadiusM} m du centre du campus.`, far(lPts));
  add('important', 'NODE_FAR', `Nœuds à plus de ${o.maxRadiusM} m du centre du campus.`, far(nPts));

  // 3. Doublons (codes, noms, positions)
  const dupBy = (keyOf: (b: (typeof buildings)[number]) => string) => {
    const seen = new Map<string, string[]>();
    for (const b of buildings) {
      const k = keyOf(b);
      if (!k) continue;
      seen.set(k, [...(seen.get(k) ?? []), b.id]);
    }
    return [...seen.values()].filter((ids) => ids.length > 1).flat();
  };
  add('important', 'BUILDING_CODE_DUP', 'Bâtiments partageant le même code.', dupBy((b) => b.code.trim().toLowerCase()));
  add('info', 'BUILDING_NAME_DUP', 'Bâtiments partageant le même nom.', dupBy((b) => b.name.trim().toLowerCase()));

  const closePairs = (pts: Pt[]) => {
    const ids = new Set<string>();
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (d(pts[i], pts[j]) < o.duplicateM) {
          ids.add(pts[i].id);
          ids.add(pts[j].id);
        }
      }
    }
    return [...ids];
  };
  add('info', 'BUILDING_POS_DUP', `Bâtiments à moins de ${o.duplicateM} m l'un de l'autre.`, closePairs(bPts));
  add('info', 'NODE_POS_DUP', `Nœuds à moins de ${o.duplicateM} m l'un de l'autre.`, closePairs(nPts));

  // 4. Cohérence bâtiments ↔ lieux
  const bIds = new Set(input.buildings.map((b) => b.id));
  add(
    'important',
    'LOCATION_ORPHAN_BUILDING',
    "Lieux rattachés à un bâtiment inexistant.",
    locations.filter((l) => l.building_id && !bIds.has(l.building_id)).map((l) => l.id),
  );
  const withEntrance = new Set(locations.filter((l) => l.kind === 'entrance' && l.building_id).map((l) => l.building_id as string));
  add(
    'important',
    'BUILDING_NO_ENTRANCE',
    "Bâtiments sans entrée (kind = 'entrance') : l'itinéraire ne peut pas viser une porte réelle.",
    buildings.filter((b) => !withEntrance.has(b.id)).map((b) => b.id),
  );

  // 5. Réseau piéton
  const nodeById = new Map(nPts.map((p) => [p.id, p]));
  const allNodeIds = new Set(input.nodes.map((n) => n.id));
  add(
    'critique',
    'SEGMENT_MISSING_NODE',
    "Segments dont un nœud d'extrémité n'existe pas.",
    segments.filter((s) => !allNodeIds.has(s.from_node) || !allNodeIds.has(s.to_node)).map((s) => s.id),
  );
  add('important', 'SEGMENT_SELF_LOOP', 'Segments reliant un nœud à lui-même.', segments.filter((s) => s.from_node === s.to_node).map((s) => s.id));
  add('important', 'SEGMENT_DISTANCE_INVALID', 'Segments avec une distance nulle, négative ou non numérique.', segments.filter((s) => !(Number.isFinite(s.distance) && s.distance > 0)).map((s) => s.id));
  add(
    'info',
    'SEGMENT_DISTANCE_MISMATCH',
    `Segments dont la distance enregistrée diffère de plus de ${Math.round(o.segmentTolerance * 100)} % de la distance réelle entre leurs nœuds.`,
    segments
      .filter((s) => {
        const a = nodeById.get(s.from_node);
        const b = nodeById.get(s.to_node);
        if (!a || !b || !(s.distance > 0)) return false;
        const real = d(a, b);
        return real > 1 && Math.abs(s.distance - real) / real > o.segmentTolerance;
      })
      .map((s) => s.id),
  );

  const usable = segments.filter((s) => nodeById.has(s.from_node) && nodeById.has(s.to_node) && s.from_node !== s.to_node);
  const adj = new Map<string, Set<string>>();
  for (const n of nPts) adj.set(n.id, new Set());
  for (const s of usable) {
    adj.get(s.from_node)?.add(s.to_node);
    adj.get(s.to_node)?.add(s.from_node);
  }
  add('important', 'NODE_ISOLATED', 'Nœuds sans aucun segment actif.', nPts.filter((n) => (adj.get(n.id)?.size ?? 0) === 0).map((n) => n.id));

  // Composantes connexes : un campus normal a UN seul réseau connecté.
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const n of nPts) {
    if (seen.has(n.id) || (adj.get(n.id)?.size ?? 0) === 0) continue;
    const comp: string[] = [];
    const stack = [n.id];
    seen.add(n.id);
    while (stack.length) {
      const cur = stack.pop() as string;
      comp.push(cur);
      for (const nb of adj.get(cur) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    components.push(comp);
  }
  if (components.length > 1) {
    components.sort((a, b) => b.length - a.length);
    add(
      'important',
      'NETWORK_DISCONNECTED',
      `Le réseau piéton est découpé en ${components.length} parties non reliées : des itinéraires entre ces parties seront impossibles. Les nœuds listés sont ceux des parties secondaires.`,
      components.slice(1).flat(),
    );
  }

  // Données de démonstration : la migration 20260903100000_seed_example_building_and_room.sql insère
  // un bâtiment, une entrée et une salle d'EXEMPLE dont les coordonnées sont calculées par décalage
  // autour du centre du campus. Ce ne sont pas des relevés : ils ne doivent pas rester visibles en
  // production (archivage depuis l'admin, voir la fin de cette migration).
  const demoIds = [
    ...buildings.filter((b) => DEMO_SEED_IDS.has(b.id)).map((b) => b.id),
    ...locations.filter((l) => DEMO_SEED_IDS.has(l.id)).map((l) => l.id),
  ];
  add(
    'important',
    'DEMO_SEED_DATA',
    "Données d'exemple (bâtiment Informatique, entrée, salle) présentes : leurs coordonnées sont des décalages, pas des relevés réels. À archiver depuis l'admin avant la production.",
    demoIds,
  );

  // Relations : un lieu rattaché à un bâtiment inexistant/archivé, ou une entrée sans bâtiment.
  const buildingIds = new Set(buildings.map((b) => b.id));
  add(
    'important',
    'LOCATION_BUILDING_DANGLING',
    'Lieux rattachés à un bâtiment inexistant ou archivé (relation incorrecte).',
    locations.filter((l) => l.building_id && !buildingIds.has(l.building_id)).map((l) => l.id),
  );
  add(
    'important',
    'ENTRANCE_WITHOUT_BUILDING',
    "Entrées sans bâtiment : impossible de relier l'entrée au bon bâtiment.",
    locations.filter((l) => l.kind === 'entrance' && !l.building_id).map((l) => l.id),
  );

  // Entrées/lieux extérieurs trop éloignés du réseau (impossible à raccorder)
  if (nPts.length > 0) {
    const snapTargets = locations.filter((l) => l.kind !== 'room' && !badCoord(l.lat, l.lng));
    add(
      'important',
      'LOCATION_NOT_SNAPPABLE',
      `Entrées/lieux à plus de ${o.maxSnapM} m du nœud de réseau le plus proche (itinéraire non raccordable).`,
      snapTargets
        .filter((l) => Math.min(...nPts.map((n) => d(n, { id: l.id, lat: l.lat, lng: l.lng }))) > o.maxSnapM)
        .map((l) => l.id),
    );
  } else {
    add('critique', 'NETWORK_EMPTY', "Aucun nœud de réseau piéton actif : aucun itinéraire ne peut être calculé.", ['route_nodes']);
  }

  return out;
}

export function formatAuditReport(findings: AuditFinding[]): string {
  if (findings.length === 0) return 'Aucune anomalie détectée par ces contrôles.\n';
  const order: AuditSeverity[] = ['critique', 'important', 'info'];
  const lines: string[] = [];
  for (const sev of order) {
    const group = findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    lines.push(`\n## ${sev.toUpperCase()} (${group.length})`);
    for (const f of group) {
      lines.push(`- [${f.code}] ${f.message}`);
      lines.push(`    ids (${f.ids.length}) : ${f.ids.slice(0, 20).join(', ')}${f.ids.length > 20 ? ', …' : ''}`);
    }
  }
  return lines.join('\n') + '\n';
}
