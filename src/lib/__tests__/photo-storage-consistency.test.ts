import { beforeEach, describe, expect, it, vi } from 'vitest';

// Passe 4 — cohérence base / Storage pour les photos.
type Res = { data?: unknown; error?: { code?: string; message: string } | null };
const state: { deleteRes: Res; removeErr: { message: string } | null; removed: string[]; uploaded: string[]; deleted: string[] } = {
  deleteRes: { data: [{ id: 'i1' }], error: null }, removeErr: null, removed: [], uploaded: [], deleted: [],
};
vi.mock('@/lib/supabase', () => {
  const chain = () => {
    let mode: 'read' | 'delete' | 'insert' = 'read';
    const result = () => (mode === 'delete' ? state.deleteRes : mode === 'insert' ? { data: null, error: { message: 'insertion non simulée' } } : { data: [], error: null });
    const t: Record<string, unknown> = {};
    t.delete = () => { mode = 'delete'; state.deleted.push('delete'); return t; };
    t.insert = () => { mode = 'insert'; return t; };
    t.eq = () => t; t.order = () => t; t.select = () => t; t.single = () => t;
    t.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return t;
  };
  return {
    supabase: {
      from: () => chain(),
      storage: { from: () => ({
        upload: (p: string) => { state.uploaded.push(p); return Promise.resolve({ error: null }); },
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x/${p}` } }),
        remove: (p: string[]) => { state.removed.push(...p); return Promise.resolve({ error: state.removeErr }); },
      }) },
    },
  };
});
vi.mock('@/lib/image-compress', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/image-compress')>()),
  prepareImageForUpload: (f: File) => Promise.resolve(f),
}));

import { deleteBuildingImage, deleteLocationImage, uploadBuildingImage } from '../api';
import { storageExtensionFor } from '../image-compress';
import type { BuildingImage, LocationImage } from '../types';

const bimg = { id: 'i1', building_id: 'b1', storage_path: 'b1/old.webp', public_url: 'u', caption: '', is_primary: false, sort_order: 0, created_at: '' } as BuildingImage;
const limg = { id: 'l1', location_id: 'x1', storage_path: 'x1/old.webp', public_url: 'u', caption: '', is_primary: false, sort_order: 0, created_at: '' } as unknown as LocationImage;

beforeEach(() => { state.deleteRes = { data: [{ id: 'i1' }], error: null }; state.removeErr = null; state.removed = []; state.uploaded = []; state.deleted = []; vi.restoreAllMocks(); });

describe('extension de stockage déduite du type MIME', () => {
  it.each([
    ['photo', 'image/jpeg', 'jpg'],
    ['IMG_0001.jfif', 'image/jpeg', 'jpg'],
    ['scan.JPE', 'image/jpeg', 'jpg'],
    ['capture.PNG', 'image/png', 'png'],
    ['sans-extension', 'image/webp', 'webp'],
    ['x.heic.avif', 'image/avif', 'avif'],
  ])('%s (%s) → .%s', (name, type, ext) => {
    expect(storageExtensionFor({ name, type })).toBe(ext);
  });
  it('type inconnu : extension du nom si autorisée, sinon jpg (jamais une extension refusée par Storage)', () => {
    expect(storageExtensionFor({ name: 'a.png', type: '' })).toBe('png');
    expect(storageExtensionFor({ name: 'a.exe', type: '' })).toBe('jpg');
    expect(storageExtensionFor({ name: 'photo', type: '' })).toBe('jpg');
  });
  it('l’envoi d’un fichier sans extension produit un chemin conforme à la règle Storage', async () => {
    const f = new File(['x'], 'photo', { type: 'image/jpeg' });
    await expect(uploadBuildingImage('b1', f)).rejects.toBeTruthy(); // l'insertion en base est volontairement refusée par le mock
    expect(state.uploaded.length).toBe(1);
    expect(state.uploaded[0]).toMatch(/^b1\/[0-9a-f-]{36}\.jpg$/);
    expect(state.removed).toEqual(state.uploaded); // l'envoi orphelin est nettoyé quand l'insertion échoue
  });
});

describe('suppression de photo : le fichier n’est retiré que si la ligne l’a été', () => {
  it('suppression réussie : ligne supprimée PUIS fichier retiré', async () => {
    await deleteBuildingImage(bimg);
    expect(state.removed).toEqual(['b1/old.webp']);
  });
  it('RLS silencieuse (0 ligne supprimée) : erreur FORBIDDEN et fichier CONSERVÉ — bâtiment', async () => {
    state.deleteRes = { data: [], error: null };
    await expect(deleteBuildingImage(bimg)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(state.removed).toEqual([]);
  });
  it('RLS silencieuse (0 ligne supprimée) : erreur FORBIDDEN et fichier CONSERVÉ — lieu', async () => {
    state.deleteRes = { data: [], error: null };
    await expect(deleteLocationImage(limg)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(state.removed).toEqual([]);
  });
  it('erreur base : propagée, fichier conservé', async () => {
    state.deleteRes = { data: null, error: { code: '42501', message: 'denied' } };
    await expect(deleteLocationImage(limg)).rejects.toBeTruthy();
    expect(state.removed).toEqual([]);
  });
  it('échec de retrait du fichier : la suppression en base aboutit mais l’orphelin est SIGNALÉ (pas silencieux)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.removeErr = { message: 'réseau coupé' };
    await expect(deleteBuildingImage(bimg)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('orphelin'));
    expect(warn.mock.calls[0][0]).toContain('b1/old.webp');
  });
});
