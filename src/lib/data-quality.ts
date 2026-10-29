/* ============================================================================
 * data-quality.ts — qualité et provenance des données institutionnelles (pur).
 *
 * Règle : une donnée n'est « confirmée » que si elle porte le statut 'validated'.
 * Tout le reste (en attente, démo, import non revu) est signalé comme non confirmé.
 * Aucune coordonnée n'est corrigée ni déduite ici : on ne fait que SIGNALER.
 * ========================================================================= */
import { haversine } from '@/lib/nav';
import type { Building, CampusLocation, DataQualityFields, VerificationStatus } from '@/lib/types';

export const DEMO_DATA_SOURCES = ['seed_demo'];

export interface StatusInfo {
  status: VerificationStatus | 'unknown';
  label: string;
  /** true seulement pour une donnée validée et non archivée. */
  confirmed: boolean;
  tone: 'ok' | 'warn' | 'muted';
}

export function verificationInfo(e: (DataQualityFields & { archived_at?: string | null }) | null | undefined): StatusInfo {
  if (!e) return { status: 'unknown', label: 'Statut inconnu', confirmed: false, tone: 'muted' };
  if (e.archived_at) return { status: 'archived', label: 'Archivé', confirmed: false, tone: 'muted' };
  if (isDemoData(e)) return { status: e.verification_status ?? 'pending', label: 'Donnée de démonstration', confirmed: false, tone: 'warn' };
  switch (e.verification_status) {
    case 'validated':
      return { status: 'validated', label: 'Validé par l’administration', confirmed: true, tone: 'ok' };
    case 'archived':
      return { status: 'archived', label: 'Archivé', confirmed: false, tone: 'muted' };
    case 'pending':
      return { status: 'pending', label: 'Non validé — à confirmer', confirmed: false, tone: 'warn' };
    default:
      // Colonne absente (migration non appliquée) : on ne présume JAMAIS qu'une donnée est confirmée.
      return { status: 'unknown', label: 'Non validé — à confirmer', confirmed: false, tone: 'warn' };
  }
}

export function isDemoData(e: DataQualityFields | null | undefined): boolean {
  return !!e?.data_source && DEMO_DATA_SOURCES.includes(e.data_source);
}

export type CoordIssue = 'invalid' | 'null_island' | 'campus_center' | 'far_from_campus' | 'duplicate_position';

export const CAMPUS_CENTER_TOLERANCE_M = 5;
export const FAR_FROM_CAMPUS_M = 3000;
export const DUPLICATE_POSITION_M = 1;

function validCoord(lng: unknown, lat: unknown): boolean {
  return (
    typeof lng === 'number' && typeof lat === 'number' && Number.isFinite(lng) && Number.isFinite(lat) &&
    lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
  );
}

/**
 * Raisons pour lesquelles des coordonnées sont suspectes. « campus_center » : placé exactement au centre
 * du campus, signe d'une position dérivée plutôt que mesurée. Liste vide = rien d'anormal détecté
 * (ce n'est PAS une preuve d'exactitude : seule la validation terrain l'établit).
 */
export function coordinateIssues(
  p: { id: string; lng: number; lat: number },
  campusCenter: [number, number] | null,
  others: Array<{ id: string; lng: number; lat: number }> = [],
): CoordIssue[] {
  if (!validCoord(p.lng, p.lat)) return ['invalid'];
  const out: CoordIssue[] = [];
  if (Math.abs(p.lng) < 1e-6 && Math.abs(p.lat) < 1e-6) out.push('null_island');
  if (campusCenter) {
    const d = haversine([p.lng, p.lat], campusCenter);
    if (d <= CAMPUS_CENTER_TOLERANCE_M) out.push('campus_center');
    else if (d > FAR_FROM_CAMPUS_M) out.push('far_from_campus');
  }
  if (others.some((o) => o.id !== p.id && validCoord(o.lng, o.lat) && haversine([p.lng, p.lat], [o.lng, o.lat]) <= DUPLICATE_POSITION_M)) {
    out.push('duplicate_position');
  }
  return out;
}

export const COORD_ISSUE_LABEL: Record<CoordIssue, string> = {
  invalid: 'Coordonnées invalides',
  null_island: 'Position (0, 0)',
  campus_center: 'Exactement au centre du campus (position dérivée ?)',
  far_from_campus: 'Très éloigné du campus',
  duplicate_position: 'Même position qu’un autre lieu',
};

export interface InventoryRow {
  kind: 'building' | 'location';
  id: string;
  name: string;
  code: string;
  status: StatusInfo;
  demo: boolean;
  issues: CoordIssue[];
  hasPhoto: boolean;
  archived: boolean;
}

export interface Inventory {
  rows: InventoryRow[];
  totals: {
    buildings: number;
    locations: number;
    validated: number;
    pending: number;
    archived: number;
    demo: number;
    withoutPhoto: number;
    suspicious: number;
  };
}

/** Inventaire en mémoire (lecture seule) : aucune écriture, aucune correction. */
export function buildInventory(
  buildings: Building[],
  locations: CampusLocation[],
  campusCenter: [number, number] | null,
): Inventory {
  const bPts = buildings.map((b) => ({ id: b.id, lng: b.center_lng, lat: b.center_lat }));
  const lPts = locations.map((l) => ({ id: l.id, lng: l.lng, lat: l.lat }));
  const rows: InventoryRow[] = [
    ...buildings.map<InventoryRow>((b) => ({
      kind: 'building', id: b.id, name: b.name, code: b.code,
      status: verificationInfo(b), demo: isDemoData(b),
      issues: coordinateIssues({ id: b.id, lng: b.center_lng, lat: b.center_lat }, campusCenter, bPts),
      hasPhoto: (b.image_count ?? 0) > 0, archived: !!b.archived_at,
    })),
    ...locations.map<InventoryRow>((l) => ({
      kind: 'location', id: l.id, name: l.name, code: l.code,
      status: verificationInfo(l), demo: isDemoData(l),
      issues: coordinateIssues({ id: l.id, lng: l.lng, lat: l.lat }, campusCenter, lPts),
      hasPhoto: !!l.primary_image_url, archived: !!l.archived_at,
    })),
  ];
  const live = rows.filter((r) => !r.archived);
  return {
    rows,
    totals: {
      buildings: buildings.length,
      locations: locations.length,
      validated: live.filter((r) => r.status.confirmed).length,
      pending: live.filter((r) => !r.status.confirmed).length,
      archived: rows.filter((r) => r.archived).length,
      demo: live.filter((r) => r.demo).length,
      withoutPhoto: live.filter((r) => !r.hasPhoto).length,
      suspicious: live.filter((r) => r.issues.length > 0).length,
    },
  };
}
