import { describe, expect, it } from 'vitest';
import { auditCampusData, formatAuditReport, type AuditInput } from '../campus-audit';

// Données FICTIVES de test (jamais des données réelles du campus).
const C = { lat: -4.3, lng: 15.3 };
// ~1 m ≈ 0.000009° ; on place les points à quelques dizaines de mètres.
const at = (dLat: number, dLng: number) => ({ lat: C.lat + dLat, lng: C.lng + dLng });

function base(): AuditInput {
  return {
    campus: { center_lat: C.lat, center_lng: C.lng },
    buildings: [{ id: 'b1', name: 'Bloc A', code: 'A', center_lat: at(0.0002, 0).lat, center_lng: C.lng }],
    locations: [{ id: 'l1', name: 'Porte A', kind: 'entrance', building_id: 'b1', ...at(0.0002, 0.00005) }],
    nodes: [
      { id: 'n1', ...at(0.0002, 0.0001) },
      { id: 'n2', ...at(0.0004, 0.0001) },
    ],
    segments: [{ id: 's1', from_node: 'n1', to_node: 'n2', distance: 22 }],
  };
}
const codes = (i: AuditInput, o = {}) => auditCampusData(i, o).map((f) => f.code);

describe('auditCampusData', () => {
  it('ne signale rien sur un jeu cohérent', () => {
    expect(codes(base())).toEqual([]);
  });

  it('détecte coordonnées invalides et (0,0) sans les corriger', () => {
    const i = base();
    i.buildings.push({ id: 'b2', name: 'B', code: 'B', center_lat: 0, center_lng: 0 });
    i.locations.push({ id: 'l2', name: 'X', kind: 'poi', building_id: null, lat: NaN, lng: 15.3 });
    const c = codes(i);
    expect(c).toContain('BUILDING_COORD_INVALID');
    expect(c).toContain('LOCATION_COORD_INVALID');
    expect(i.buildings[1].center_lat).toBe(0); // aucune donnée modifiée
  });

  it('détecte les points hors zone attendue', () => {
    const i = base();
    i.buildings.push({ id: 'far', name: 'Loin', code: 'F', center_lat: C.lat + 0.1, center_lng: C.lng });
    expect(codes(i)).toContain('BUILDING_FAR');
  });

  it('détecte doublons de code et bâtiments sans entrée', () => {
    const i = base();
    i.buildings.push({ id: 'b2', name: 'Autre', code: 'a', ...{ center_lat: at(0.0003, 0).lat, center_lng: C.lng } });
    const c = codes(i);
    expect(c).toContain('BUILDING_CODE_DUP');
    expect(c).toContain('BUILDING_NO_ENTRANCE'); // b2 n'a pas d'entrée
  });

  it('détecte segments vers un nœud inexistant, boucles et distances invalides', () => {
    const i = base();
    i.segments.push({ id: 's2', from_node: 'n1', to_node: 'ghost', distance: 10 });
    i.segments.push({ id: 's3', from_node: 'n2', to_node: 'n2', distance: 10 });
    i.segments.push({ id: 's4', from_node: 'n1', to_node: 'n2', distance: 0 });
    const c = codes(i);
    expect(c).toContain('SEGMENT_MISSING_NODE');
    expect(c).toContain('SEGMENT_SELF_LOOP');
    expect(c).toContain('SEGMENT_DISTANCE_INVALID');
  });

  it('détecte un réseau découpé en plusieurs parties et les nœuds isolés', () => {
    const i = base();
    i.nodes.push({ id: 'n3', ...at(0.0006, 0.0001) }, { id: 'n4', ...at(0.0007, 0.0001) }, { id: 'n5', ...at(0.0008, 0.0001) });
    i.segments.push({ id: 's5', from_node: 'n3', to_node: 'n4', distance: 11 });
    const found = auditCampusData(i);
    const disc = found.find((f) => f.code === 'NETWORK_DISCONNECTED');
    expect(disc?.ids.sort()).toEqual(['n3', 'n4']);
    expect(found.find((f) => f.code === 'NODE_ISOLATED')?.ids).toEqual(['n5']);
  });

  it('signale un lieu impossible à raccorder au réseau', () => {
    const i = base();
    i.locations.push({ id: 'l9', name: 'Isolé', kind: 'poi', building_id: null, ...at(0.003, 0.003) });
    expect(auditCampusData(i, { maxRadiusM: 5000 }).find((f) => f.code === 'LOCATION_NOT_SNAPPABLE')?.ids).toContain('l9');
  });

  it('ignore les lignes archivées', () => {
    const i = base();
    i.buildings.push({ id: 'old', name: 'Ancien', code: 'A', center_lat: 0, center_lng: 0, archived_at: '2026-01-01' });
    expect(codes(i)).toEqual([]);
  });

  it("signale l'absence totale de réseau", () => {
    const i = base();
    i.nodes = [];
    i.segments = [];
    expect(codes(i)).toContain('NETWORK_EMPTY');
  });

  it('formate un rapport lisible', () => {
    const i = base();
    i.nodes = [];
    expect(formatAuditReport(auditCampusData(i))).toContain('CRITIQUE');
    expect(formatAuditReport([])).toContain('Aucune anomalie');
  });
});

describe('relations bâtiments / lieux (audit cartographie)', () => {
  const base = {
    campus: { center_lat: 1, center_lng: 10 },
    buildings: [{ id: 'b1', name: 'B1', code: 'B1', center_lat: 1, center_lng: 10 }],
    nodes: [{ id: 'n1', lat: 1, lng: 10 }],
    segments: [],
  };
  it('signale un lieu rattaché à un bâtiment inexistant et une entrée sans bâtiment', () => {
    const f = auditCampusData({
      ...base,
      locations: [
        { id: 'l1', name: 'Salle', kind: 'poi', building_id: 'inconnu', lat: 1, lng: 10 },
        { id: 'l2', name: 'Porte', kind: 'entrance', building_id: null, lat: 1, lng: 10 },
        { id: 'l3', name: 'Ok', kind: 'poi', building_id: 'b1', lat: 1, lng: 10 },
      ],
    });
    expect(f.find((x) => x.code === 'LOCATION_BUILDING_DANGLING')?.ids).toEqual(['l1']);
    expect(f.find((x) => x.code === 'ENTRANCE_WITHOUT_BUILDING')?.ids).toEqual(['l2']);
  });
});

describe('données de démonstration (migration d’amorçage)', () => {
  it('signale le bâtiment, l’entrée et la salle d’exemple, sans toucher aux autres', () => {
    const f = auditCampusData({
      campus: { center_lat: 1, center_lng: 10 },
      buildings: [
        { id: '00000000-0000-4000-a000-000000000b01', name: 'Bâtiment Informatique', code: 'INFO', center_lat: 1, center_lng: 10 },
        { id: 'reel-1', name: 'Réel', code: 'R', center_lat: 1, center_lng: 10 },
      ],
      locations: [
        { id: '00000000-0000-4000-a000-000000000101', name: 'Salle Jumelle 1', kind: 'room', building_id: '00000000-0000-4000-a000-000000000b01', lat: 1, lng: 10 },
        { id: 'reel-loc', name: 'Bureau', kind: 'poi', building_id: 'reel-1', lat: 1, lng: 10 },
      ],
      nodes: [{ id: 'n1', lat: 1, lng: 10 }],
      segments: [],
    });
    const demo = f.find((x) => x.code === 'DEMO_SEED_DATA');
    expect(demo?.severity).toBe('important');
    expect(demo?.ids).toEqual(['00000000-0000-4000-a000-000000000b01', '00000000-0000-4000-a000-000000000101']);
  });
});
