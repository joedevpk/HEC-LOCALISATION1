import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Star, Trash2 } from 'lucide-react';
import {
  deleteBuildingImage,
  getBuildingImages,
  reorderBuildingImages,
  setPrimaryBuildingImage,
  uploadBuildingImage,
} from '@/lib/api';
import type { Building, BuildingImage } from '@/lib/types';

/**
 * Galerie de photos d'un bâtiment (PROBLÈME 1 du cahier des charges) :
 * sélection depuis l'appareil, aperçu avant envoi, plusieurs photos,
 * photo principale, suppression, réordonnancement.
 */
export function BuildingImagesPanel({
  building,
  onChanged,
}: {
  building: Building;
  onChanged?: () => void;
}) {
  const [images, setImages] = useState<BuildingImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoading(true);
    try {
      setImages(await getBuildingImages(building.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement des photos impossible.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building.id]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await uploadBuildingImage(building.id, file);
      }
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi de l'image impossible.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const makePrimary = async (img: BuildingImage) => {
    try {
      await setPrimaryBuildingImage(img);
      await reload();
      onChanged?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Impossible de définir la photo principale.');
    }
  };

  const remove = async (img: BuildingImage) => {
    if (!confirm('Supprimer cette photo ?')) return;
    try {
      await deleteBuildingImage(img);
      await reload();
      onChanged?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next);
    try {
      await reorderBuildingImages(next);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Réordonnancement impossible.');
      await reload();
    }
  };

  return (
    <div className="ml-4 mt-1 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Photos de {building.name}
        </p>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-hec-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-hec-900">
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
          Ajouter des photos
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Taille maximale : 5 Mo par photo (JPEG, PNG, WebP ou AVIF). Les photos sont compressées avant l'envoi.
      </p>

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
        </p>
      ) : images.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">
          Aucune photo pour ce bâtiment. Ajoutez au moins une photo principale
          pour qu'elle apparaisse dans les résultats de recherche.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {images.map((img, index) => (
            <div
              key={img.id}
              className="group relative overflow-hidden rounded-xl border border-slate-100 bg-white"
            >
              <img
                src={img.public_url}
                alt={img.caption || building.name}
                className="h-24 w-full object-cover"
              />
              {img.is_primary && (
                <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-hec-950/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                  <Star className="h-2.5 w-2.5 fill-current" /> Principale
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-hec-950/80 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex gap-1">
                  <button
                    type="button"
                    title="Déplacer avant"
                    onClick={() => move(index, -1)}
                    className="grid h-6 w-6 place-items-center rounded-md bg-white/90 text-hec-700 hover:bg-white"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    title="Déplacer après"
                    onClick={() => move(index, 1)}
                    className="grid h-6 w-6 place-items-center rounded-md bg-white/90 text-hec-700 hover:bg-white"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex gap-1">
                  {!img.is_primary && (
                    <button
                      type="button"
                      title="Définir comme photo principale"
                      onClick={() => makePrimary(img)}
                      className="grid h-6 w-6 place-items-center rounded-md bg-white/90 text-hec-700 hover:bg-white"
                    >
                      <Star className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Supprimer"
                    onClick={() => remove(img)}
                    className="grid h-6 w-6 place-items-center rounded-md bg-white/90 text-red-500 hover:bg-white"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
