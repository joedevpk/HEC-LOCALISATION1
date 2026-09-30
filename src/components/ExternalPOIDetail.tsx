import { ExternalLink, Navigation, X } from 'lucide-react';
import type { ExternalPOI } from '@/lib/poi-categories';
import { poiCategoryColors, poiCategoryLabels, poiCategorySvgPaths } from '@/lib/poi-categories';
import { formatDistance, haversine } from '@/lib/nav';
import { Button } from '@/components/ui';

/**
 * Fiche d'un lieu externe (ÉTAPE 11 du cahier des charges POI).
 *
 * Volontairement différente de `LocationDetail` (lieux HEC) : un POI
 * externe n'a pas de bâtiment/étage/salles HEC, et son itinéraire ne
 * passe pas par le réseau de chemins interne du campus. Plutôt que de
 * dessiner un faux tracé sur la carte du campus (interdit par le
 * cahier des charges), le bouton "Itinéraire" ouvre les directions
 * OpenStreetMap dans un nouvel onglet — un vrai itinéraire, juste pas
 * rendu dans l'app.
 */
export function ExternalPOIDetail({
  poi,
  userLng,
  userLat,
  onClose,
}: {
  poi: ExternalPOI;
  userLng?: number;
  userLat?: number;
  onClose: () => void;
}) {
  const color = poiCategoryColors[poi.category];
  const path = poiCategorySvgPaths[poi.category];
  const distanceMeters =
    userLng != null && userLat != null
      ? haversine([userLng, userLat], [poi.lng, poi.lat])
      : null;

  const directionsUrl = `https://www.openstreetmap.org/directions?to=${poi.lat}%2C${poi.lng}`;

  return (
    <div className="animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white"
            style={{ background: color }}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
              <path d={path} />
            </svg>
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-hec-500">
              {poiCategoryLabels[poi.category]} · lieu public (OpenStreetMap)
            </p>
            <h2 className="font-display text-xl font-bold text-hec-950">{poi.name}</h2>
          </div>
        </div>
        <button
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {poi.description && (
        <p className="mt-4 text-sm leading-relaxed text-slate-600">{poi.description}</p>
      )}

      {distanceMeters != null && (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Distance à vol d'oiseau
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-hec-950">
            {formatDistance(distanceMeters)}
          </dd>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Ce lieu est extérieur au campus HEC : l'itinéraire n'est pas calculé sur le réseau de
        chemins interne, mais peut être ouvert dans OpenStreetMap.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <Button
          size="lg"
          className="flex-1"
          icon={<Navigation className="h-5 w-5" />}
          onClick={() => window.open(directionsUrl, '_blank', 'noopener,noreferrer')}
        >
          Itinéraire
        </Button>
        <a
          href={`https://www.openstreetmap.org/${poi.id.replace('osm:', '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-400 transition-colors hover:border-hec-200 hover:text-hec-500"
          aria-label="Voir sur OpenStreetMap"
        >
          <ExternalLink className="h-5 w-5" />
        </a>
      </div>
    </div>
  );
}
