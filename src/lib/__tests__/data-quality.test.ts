import { describe, expect, it } from 'vitest';
import { buildInventory, coordinateIssues, isDemoData, verificationInfo } from '../data-quality';
import type { Building, CampusLocation } from '../types';

const center: [number, number] = [15.3, -4.32];
const b = (o: Partial<Building> = {}): Building => ({ id: 'b1', campus_id: 'c', name: 'B', code: 'B1', description: '', category: 'academic', color: '#000', center_lng: 15.301, center_lat: -4.321, floor_count: 1, ...o });
const l = (o: Partial<CampusLocation> = {}): CampusLocation => ({ id: 'l1', building_id: 'b1', floor_id: null, name: 'S', code: 'S1', kind: 'room', category: 'x', description: '', capacity: null, lng: 15.302, lat: -4.322, is_accessible: true, ...o });

describe('statut de validation', () => {
  it('seul « validated » est confirmé', () => {
    expect(verificationInfo(b({ verification_status: 'validated' })).confirmed).toBe(true);
    expect(verificationInfo(b({ verification_status: 'pending' })).confirmed).toBe(false);
  });
  it('colonne absente (migration non appliquée) : jamais présumé confirmé', () => {
    const i = verificationInfo(b());
    expect(i.confirmed).toBe(false);
    expect(i.label).toMatch(/Non validé/);
  });
  it('un bâtiment validé mais archivé n’est pas confirmé', () => {
    expect(verificationInfo(b({ verification_status: 'validated', archived_at: '2026-01-01' })).confirmed).toBe(false);
  });
  it('les données de démonstration sont identifiées et jamais confirmées, même « validées »', () => {
    const d = b({ data_source: 'seed_demo', verification_status: 'validated' });
    expect(isDemoData(d)).toBe(true);
    expect(verificationInfo(d).confirmed).toBe(false);
    expect(verificationInfo(d).label).toMatch(/démonstration/);
  });
  it('entité absente : statut inconnu, non confirmé', () => {
    expect(verificationInfo(null).confirmed).toBe(false);
  });
});

describe('coordonnées suspectes', () => {
  it('invalides, (0,0), centre du campus, très éloignées, doublons', () => {
    expect(coordinateIssues({ id: 'x', lng: NaN, lat: 1 }, center)).toEqual(['invalid']);
    expect(coordinateIssues({ id: 'x', lng: 200, lat: 1 }, center)).toEqual(['invalid']);
    expect(coordinateIssues({ id: 'x', lng: 0, lat: 0 }, null)).toContain('null_island');
    expect(coordinateIssues({ id: 'x', lng: 15.3, lat: -4.32 }, center)).toContain('campus_center');
    expect(coordinateIssues({ id: 'x', lng: 15.4, lat: -4.32 }, center)).toContain('far_from_campus');
    expect(coordinateIssues({ id: 'a', lng: 15.3011, lat: -4.3211 }, center, [{ id: 'b', lng: 15.3011, lat: -4.3211 }])).toContain('duplicate_position');
  });
  it('position normale : aucune alerte (ce n’est pas une preuve d’exactitude)', () => {
    expect(coordinateIssues({ id: 'x', lng: 15.3012, lat: -4.3205 }, center)).toEqual([]);
  });
});

describe('inventaire (lecture seule)', () => {
  it('compte validés, non validés, démo, sans photo, suspects et archivés', () => {
    const inv = buildInventory(
      [b({ id: 'b1', verification_status: 'validated', image_count: 2 }), b({ id: 'b2', code: 'B2', data_source: 'seed_demo', center_lng: 15.3, center_lat: -4.32 }), b({ id: 'b3', code: 'B3', archived_at: '2026-01-01' })],
      [l({ id: 'l1', primary_image_url: 'u' }), l({ id: 'l2', code: 'S2', lng: 15.302, lat: -4.322 })],
      center,
    );
    expect(inv.totals).toMatchObject({ buildings: 3, locations: 2, validated: 1, archived: 1, demo: 1 });
    expect(inv.totals.suspicious).toBeGreaterThanOrEqual(3); // b2 au centre + l1/l2 même position
    expect(inv.totals.withoutPhoto).toBeGreaterThanOrEqual(2);
    expect(inv.rows.find((r) => r.id === 'b3')?.archived).toBe(true);
  });
  it('liste vide : tous les compteurs à zéro', () => {
    expect(buildInventory([], [], null).totals).toMatchObject({ buildings: 0, locations: 0, validated: 0, pending: 0, demo: 0 });
  });
});
