import { PhotoManager } from '@/components/PhotoManager';
import type { CampusLocation } from '@/lib/types';

/** Galerie administrable d'une salle/lieu (voir PhotoManager). */
export function LocationImagesPanel({ location, onChanged }: { location: CampusLocation; onChanged?: () => void }) {
  return <PhotoManager kind="location" parentId={location.id} parentName={location.name} onChanged={onChanged} />;
}
