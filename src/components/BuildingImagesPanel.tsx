import { PhotoManager } from '@/components/PhotoManager';
import type { Building } from '@/lib/types';

/** Galerie administrable d'un bâtiment (voir PhotoManager). */
export function BuildingImagesPanel({ building, onChanged }: { building: Building; onChanged?: () => void }) {
  return <PhotoManager kind="building" parentId={building.id} parentName={building.name} onChanged={onChanged} />;
}
