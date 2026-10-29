import { beforeEach, describe, expect, it, vi } from 'vitest';

type Res = { data?: unknown; error?: { code?: string; message: string } | null };
const state: { updateRes: Res; rpcRes: Res; uploadErr: { message: string } | null; removed: string[]; uploaded: string[] } = {
  updateRes: { data: [{ id: '1' }], error: null }, rpcRes: { data: null, error: null }, uploadErr: null, removed: [], uploaded: [],
};
vi.mock('@/lib/supabase', () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    c.update = () => c; c.eq = () => c;
    c.select = () => Promise.resolve(state.updateRes);
    return c;
  };
  return {
    supabase: {
      from: () => chain(),
      rpc: () => Promise.resolve(state.rpcRes),
      storage: { from: () => ({
        upload: (p: string) => { state.uploaded.push(p); return Promise.resolve({ error: state.uploadErr }); },
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x/${p}` } }),
        remove: (p: string[]) => { state.removed.push(...p); return Promise.resolve({}); },
      }) },
    },
  };
});
vi.mock('@/lib/image-compress', () => ({
  prepareImageForUpload: (f: File) => Promise.resolve(f),
  ImageValidationError: class extends Error { code = 'X'; },
}));

import { importCampusData, replaceImageFile, setImageArchived, setVerificationStatus } from '../api';
import type { BuildingImage } from '../types';

const img = { id: 'i1', building_id: 'b1', storage_path: 'b1/old.webp', public_url: 'u', caption: '', is_primary: false, sort_order: 0, created_at: '' } as BuildingImage;
const file = new File(['x'], 'p.webp', { type: 'image/webp' });

beforeEach(() => { state.updateRes = { data: [{ id: '1' }], error: null }; state.rpcRes = { data: null, error: null }; state.uploadErr = null; state.removed = []; state.uploaded = []; });

describe('API de gouvernance', () => {
  it('refus serveur (42501) : message explicite « droits »', async () => {
    state.updateRes = { data: null, error: { code: '42501', message: 'Seuls les administrateurs peuvent valider.' } };
    await expect(setVerificationStatus('buildings', 'b1', 'validated')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('aucune ligne modifiée (RLS silencieuse) : jamais présenté comme un succès', async () => {
    state.updateRes = { data: [], error: null };
    await expect(setVerificationStatus('buildings', 'b1', 'validated')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(setImageArchived('building', 'i1', true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('migration absente (colonne inexistante) : message clair', async () => {
    state.updateRes = { data: null, error: { code: '42703', message: 'column "verification_status" does not exist' } };
    await expect(setVerificationStatus('buildings', 'b1', 'validated')).rejects.toMatchObject({ code: 'MIGRATION_MISSING' });
  });
  it('import : renvoie le récapitulatif du serveur ; une erreur est propagée sans succès simulé', async () => {
    state.rpcRes = { data: { buildings_created: 1, rooms_created: 2, floors_created: 1 }, error: null };
    await expect(importCampusData({ campus_id: 'c', buildings: [], rooms: [] })).resolves.toEqual({ buildings_created: 1, rooms_created: 2, floors_created: 1 });
    state.rpcRes = { data: null, error: { message: 'Doublon : le bâtiment B1 existe déjà.' } };
    await expect(importCampusData({ campus_id: 'c', buildings: [], rooms: [] })).rejects.toThrow(/Doublon/);
  });
  it('remplacement de photo réussi : nouveau fichier envoyé PUIS ancien supprimé', async () => {
    await replaceImageFile('building', img, file);
    expect(state.uploaded).toHaveLength(1);
    expect(state.uploaded[0]).toMatch(/^b1\/[0-9a-f-]{36}\.webp$/);
    expect(state.removed).toEqual(['b1/old.webp']);
  });
  it('remplacement refusé par la base : le NOUVEAU fichier est retiré, l’ancien est conservé', async () => {
    state.updateRes = { data: null, error: { code: '42501', message: 'denied' } };
    await expect(replaceImageFile('building', img, file)).rejects.toBeTruthy();
    expect(state.removed).toEqual([state.uploaded[0]]);
    expect(state.removed).not.toContain('b1/old.webp');
  });
  it('échec d’envoi : aucune modification, aucun fichier supprimé', async () => {
    state.uploadErr = { message: 'quota' };
    await expect(replaceImageFile('building', img, file)).rejects.toMatchObject({ code: 'STORAGE_UPLOAD_FAILED' });
    expect(state.removed).toEqual([]);
  });
});
