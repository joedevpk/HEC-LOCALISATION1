import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, ArrowDown, ArrowUp, BadgeCheck, ImagePlus, Loader2, RefreshCw, RotateCcw, Star, Trash2 } from 'lucide-react';
import {
  deleteBuildingImage, deleteLocationImage, getBuildingImages, getLocationImages,
  reorderBuildingImages, reorderLocationImages, replaceImageFile, setImageArchived,
  setPrimaryBuildingImage, setPrimaryLocationImage, setVerificationStatus, updateImageMeta,
  uploadBuildingImage, uploadLocationImage,
} from '@/lib/api';
import type { BuildingImage, LocationImage, PhotoKind } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { isFullAdminRole } from '@/lib/roles';

type Img = BuildingImage | LocationImage;
const KIND_LABEL: Record<PhotoKind, string> = {
  cover: 'Couverture', exterior: 'Extérieur', entrance: 'Entrée principale', interior: 'Intérieur', other: 'Autre',
};
const btn =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-hec-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500 disabled:opacity-50';

/**
 * Gestion complète des photos d'un bâtiment ou d'une salle : ajout (compression + contrôle de format/poids
 * côté client ET côté Storage), photo de couverture, type, légende (texte alternatif), ordre, remplacement,
 * archivage/restauration, validation (réservée aux administrateurs), suppression définitive.
 * Commandes toujours visibles (pas seulement au survol) et cibles ≥ 44 px pour le tactile.
 */
export function PhotoManager({
  kind, parentId, parentName, onChanged,
}: {
  kind: 'building' | 'location';
  parentId: string;
  parentName: string;
  onChanged?: () => void;
}) {
  const { profile } = useAuth();
  const canValidate = isFullAdminRole(profile?.role);
  const [images, setImages] = useState<Img[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<Img | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setImages(kind === 'building' ? await getBuildingImages(parentId, true) : await getLocationImages(parentId, true));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement des photos impossible.');
    } finally {
      setLoading(false);
    }
  }, [kind, parentId]);
  useEffect(() => { void reload(); }, [reload]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); await reload(); onChanged?.(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action impossible.'); }
    finally { setBusy(null); }
  };

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    void run('add', async () => {
      for (const f of Array.from(files)) {
        if (kind === 'building') await uploadBuildingImage(parentId, f); else await uploadLocationImage(parentId, f);
      }
    }).finally(() => { if (addRef.current) addRef.current.value = ''; });
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const next = [...images]; [next[i], next[j]] = [next[j], next[i]];
    setImages(next);
    void run('move', async () => {
      if (kind === 'building') await reorderBuildingImages(next as BuildingImage[]); else await reorderLocationImages(next as LocationImage[]);
    });
  };
  const table = kind === 'building' ? 'building_images' : 'location_images';
  const active = images.filter((i) => !i.archived_at);
  const hasPrimary = active.some((i) => i.is_primary);

  return (
    <section className="mt-1 min-w-0 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3" aria-label={`Photos de ${parentName}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="min-w-0 break-words text-xs font-semibold uppercase tracking-wide text-slate-600">Photos — {parentName}</h4>
        <label className={`${btn} cursor-pointer bg-hec-950 text-white hover:bg-hec-900`}>
          {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          Ajouter des photos
          <input ref={addRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={!!busy} onChange={(e) => add(e.target.files)} />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        JPEG, PNG, WebP ou AVIF, 5 Mo maximum (compressées avant l’envoi). Seules de vraies photographies du lieu doivent être ajoutées.
      </p>
      <input ref={replaceRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" aria-hidden="true" tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0]; const target = replaceTarget.current;
          if (f && target) void run(`rep-${target.id}`, () => replaceImageFile(kind, target, f));
          e.target.value = '';
        }} />
      {error && <p role="alert" className="mt-2 break-words rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…</p>
      ) : images.length === 0 ? (
        <p className="mt-3 rounded-lg bg-white px-3 py-3 text-sm text-slate-700">
          <strong>Photo non disponible.</strong> Aucune photo réelle n’a encore été ajoutée : la fiche publique l’indique clairement.
        </p>
      ) : (
        <>
          {!hasPrimary && active.length > 0 && <p className="mt-2 text-xs font-medium text-amber-800">Aucune photo de couverture : choisissez-en une (étoile).</p>}
          <ul className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]">
            {images.map((img, i) => (
              <li key={img.id} className={`min-w-0 overflow-hidden rounded-xl border bg-white ${img.archived_at ? 'border-slate-300 opacity-80' : 'border-slate-200'}`}>
                <div className="relative">
                  <img src={img.public_url} alt={img.caption || `${parentName} — photo ${i + 1}`} loading="lazy" decoding="async" width={480} height={288}
                    className="h-36 w-full bg-slate-100 object-cover" />
                  <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
                    {img.is_primary && <span className="inline-flex items-center gap-1 rounded-full bg-hec-950 px-2 py-0.5 text-[10px] font-semibold text-white"><Star className="h-2.5 w-2.5 fill-current" />Couverture</span>}
                    {img.archived_at && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-white">Archivée</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${img.verification_status === 'validated' ? 'bg-emerald-700 text-white' : 'bg-amber-100 text-amber-900'}`}>
                      {img.verification_status === 'validated' ? 'Validée' : 'Non validée'}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 p-2.5">
                  <label className="block text-[11px] font-medium text-slate-700">Légende (texte alternatif)
                    <input defaultValue={img.caption} maxLength={200} disabled={!!busy}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== img.caption) void run(`cap-${img.id}`, () => updateImageMeta(kind, img.id, { caption: v })); }}
                      className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm text-hec-950 focus:border-hec-500 focus:outline-none focus:ring-2 focus:ring-hec-200" />
                  </label>
                  <label className="block text-[11px] font-medium text-slate-700">Type de photo
                    <select value={img.photo_kind ?? 'other'} disabled={!!busy}
                      onChange={(e) => void run(`kind-${img.id}`, () => updateImageMeta(kind, img.id, { photo_kind: e.target.value as PhotoKind }))}
                      className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-hec-950">
                      {(Object.keys(KIND_LABEL) as PhotoKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                  </label>
                  <p className="text-[11px] text-slate-600">Ajoutée le {new Date(img.created_at).toLocaleDateString('fr-FR')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className={btn} aria-label="Monter" disabled={!!busy || i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" className={btn} aria-label="Descendre" disabled={!!busy || i === images.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
                    {!img.is_primary && !img.archived_at && (
                      <button type="button" className={btn} disabled={!!busy}
                        onClick={() => void run(`pri-${img.id}`, () => (kind === 'building' ? setPrimaryBuildingImage(img as BuildingImage) : setPrimaryLocationImage(img as LocationImage)))}>
                        <Star className="h-4 w-4" /> Couverture
                      </button>
                    )}
                    <button type="button" className={btn} disabled={!!busy} onClick={() => { replaceTarget.current = img; replaceRef.current?.click(); }}>
                      {busy === `rep-${img.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Remplacer
                    </button>
                    {canValidate && !img.archived_at && (
                      <button type="button" className={btn} disabled={!!busy}
                        onClick={() => void run(`val-${img.id}`, () => setVerificationStatus(table, img.id, img.verification_status === 'validated' ? 'pending' : 'validated'))}>
                        <BadgeCheck className="h-4 w-4" /> {img.verification_status === 'validated' ? 'Retirer la validation' : 'Valider'}
                      </button>
                    )}
                    <button type="button" className={btn} disabled={!!busy}
                      onClick={() => void run(`arc-${img.id}`, () => setImageArchived(kind, img.id, !img.archived_at))}>
                      {img.archived_at ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {img.archived_at ? 'Restaurer' : 'Archiver'}
                    </button>
                    <button type="button" className={`${btn} text-red-700`} disabled={!!busy}
                      onClick={() => { if (confirm('Supprimer définitivement cette photo (fichier compris) ? Préférez « Archiver » si un doute existe.')) void run(`del-${img.id}`, () => (kind === 'building' ? deleteBuildingImage(img as BuildingImage) : deleteLocationImage(img as LocationImage))); }}>
                      <Trash2 className="h-4 w-4" /> Supprimer
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
