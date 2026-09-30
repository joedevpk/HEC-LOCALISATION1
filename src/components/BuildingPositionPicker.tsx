import { useEffect, useState, type ComponentProps } from 'react';
import { AlertTriangle, Check, Layers, Loader2, MapPin, RotateCcw, X } from 'lucide-react';
import { CampusMap } from '@/components/CampusMap';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui';
import { toLngLat, isNullIsland } from '@/lib/geo-validation';
import type { Campus, CampusLocation } from '@/lib/types';

// ASSOMPTION À VÉRIFIER : 'satellite' doit être une valeur réellement
// acceptée par la prop `styleMode` de CampusMap (voir CampusMap.tsx /
// map-config.ts). Le type est dérivé automatiquement de la vraie prop pour
// que le compilateur rejette toute valeur invalide — si 'satellite' n'existe
// pas côté CampusMap, retirez simplement le bouton correspondant ci-dessous.
type MapStyleMode = ComponentProps<typeof CampusMap>['styleMode'];
const STYLE_OPTIONS: { key: MapStyleMode; label: string }[] = [
  { key: 'plan' as MapStyleMode, label: 'Plan' },
  { key: 'satellite' as MapStyleMode, label: 'Satellite' },
];

/**
 * PROBLÈME 2 du cahier des charges : plus besoin de saisir
 * latitude/longitude à la main. L'administrateur ouvre une vraie carte,
 * clique (ou déplace le point), ajuste, puis confirme — la position
 * exacte est ensuite enregistrée dans la base par l'appelant.
 *
 * Réutilise `CampusMap` en mode "sélection manuelle" (déjà utilisé côté
 * étudiant pour choisir un point de départ quand le GPS est indisponible)
 * plutôt que de dupliquer la logique de carte.
 *
 * Ce composant est volontairement générique (initialLng/initialLat/title)
 * plutôt que lié au type Building : c'est ce qui permet de le réutiliser
 * tel quel pour positionner à la fois un bâtiment et, si l'appelant le
 * souhaite, une entrée — sans dupliquer de code ni supposer l'existence de
 * champs (ex. entrance_lng/entrance_lat) que je n'ai pas pu vérifier dans
 * src/lib/types.ts. Si ces champs existent réellement, l'appelant peut
 * monter ce même composant une seconde fois avec un `title` et des
 * coordonnées initiales différents.
 *
 * L'écriture en base reste entièrement à la charge de l'appelant via
 * `onConfirm`, qui doit passer par api.ts — ce composant ne parle jamais
 * directement à Supabase et ne contourne donc jamais RLS. Les props
 * optionnelles `saving` / `error` permettent à l'appelant de faire
 * remonter ici l'état réel de cette écriture (y compris un refus RLS)
 * plutôt que de le masquer.
 */
export function BuildingPositionPicker({
  campus,
  initialLng,
  initialLat,
  title,
  saving = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  campus: Campus;
  initialLng: number;
  initialLat: number;
  title: string;
  /** L'appelant passe `true` pendant l'appel api.ts déclenché par onConfirm. */
  saving?: boolean;
  /** Message d'erreur réel (ex. refus RLS) renvoyé par l'appelant après un échec de sauvegarde. */
  error?: string | null;
  onConfirm: (lngLat: [number, number]) => void;
  onCancel: () => void;
}) {
  // Position initiale : jamais acceptée telle quelle si elle est NaN,
  // Infinity, hors-plage, ou (0,0) — (0,0) est la valeur par défaut d'un
  // bâtiment/lieu jamais encore positionné (emptyBuildingForm /
  // emptyLocationForm), pas une vraie position à afficher : sans ce
  // filtre, la carte plaçait un marqueur et faisait un flyTo vers "Null
  // Island" (0,0, en plein océan) dès l'ouverture pour un nouvel élément.
  // toLngLat() seul ne suffit pas ici : il ne rejette que les coordonnées
  // hors-bornes, pas (0,0) — isNullIsland() est le même garde-fou déjà
  // utilisé par validateCoordinates()/assertValidCoordinates() côté api.ts.
  const initialValid =
    toLngLat(initialLng, initialLat) !== null && !isNullIsland(initialLat, initialLng);
  const [picked, setPicked] = useState<[number, number] | null>(
    initialValid ? [initialLng, initialLat] : null,
  );
  const [styleMode, setStyleMode] = useState<MapStyleMode>('plan' as MapStyleMode);
  const [manualLng, setManualLng] = useState(initialValid ? String(initialLng) : '');
  const [manualLat, setManualLat] = useState(initialValid ? String(initialLat) : '');
  // Auparavant ignorée (`onMapError={() => undefined}`) : une vraie panne de
  // carte (ex. MapConfigError si aucun fournisseur n'est configuré) restait
  // invisible ici et, faute de frontière d'erreur locale, pouvait faire
  // planter tout AdminCampusManager. On l'affiche désormais dans la modale,
  // sans bloquer la saisie manuelle lat/lng ci-dessous.
  const [mapError, setMapError] = useState<string | null>(null);

  // Garde les champs de saisie manuelle synchronisés quand la position
  // change via un clic ou un drag sur la carte.
  useEffect(() => {
    if (picked) {
      setManualLng(String(picked[0]));
      setManualLat(String(picked[1]));
    }
  }, [picked]);

  const pickedValid = picked !== null && toLngLat(picked[0], picked[1]) !== null;

  const previewLocation: CampusLocation | null = picked
    ? {
        id: '__picked_position__',
        building_id: null,
        floor_id: null,
        name: 'Position choisie',
        code: '',
        kind: 'poi',
        category: 'position',
        description: '',
        capacity: null,
        lng: picked[0],
        lat: picked[1],
        is_accessible: true,
      }
    : null;

  function handleManualApply() {
    const lng = Number(manualLng);
    const lat = Number(manualLat);
    const validated = toLngLat(lng, lat);
    if (!validated) return;
    setPicked([lng, lat]);
  }

  const manualParsed = { lng: Number(manualLng), lat: Number(manualLat) };
  const manualValid = toLngLat(manualParsed.lng, manualParsed.lat) !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-hec-950/60 p-4 backdrop-blur-sm">
      <div className="flex h-[min(700px,90vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-hec-500">
              Positionner sur la carte
            </p>
            <h3 className="font-display text-base font-bold text-hec-950">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative flex-1">
          <ErrorBoundary
            title="La carte rencontre un problème."
            description="Vous pouvez toujours saisir la position manuellement ci-dessous."
          >
            <CampusMap
              campus={campus}
              buildings={[]}
              poiLocations={[]}
              externalPois={[]}
              focusLocation={previewLocation}
              originLocation={previewLocation}
              routeCoordinates={null}
              styleMode={styleMode}
              manualPickMode
              onSelectBuilding={() => undefined}
              onSelectLocation={() => undefined}
              onSelectExternalPOI={() => undefined}
              onManualPick={(lngLat) => setPicked(lngLat)}
              onGeolocate={() => undefined}
              onGeolocateError={() => undefined}
              onMapError={setMapError}
            />
          </ErrorBoundary>
          {mapError && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-white/95 p-6 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-100 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <p className="max-w-xs text-sm font-semibold text-hec-950">{mapError}</p>
              <p className="max-w-xs text-xs text-slate-500">
                Vous pouvez saisir la latitude/longitude manuellement ci-dessous en attendant.
              </p>
            </div>
          )}
          <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-semibold text-hec-700 shadow-glass">
              <MapPin className="h-3.5 w-3.5 text-hec-500" />
              Cliquez sur la carte pour placer le point, puis faites-le
              glisser pour l'ajuster rapidement — autant de fois que
              nécessaire.
            </div>
          </div>
          <div className="pointer-events-auto absolute right-3 top-4 z-10 flex items-center gap-1 rounded-full bg-white/95 p-1 shadow-glass">
            <Layers className="ml-1.5 h-3.5 w-3.5 text-slate-400" />
            {STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.key as string}
                type="button"
                onClick={() => setStyleMode(opt.key)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                  styleMode === opt.key ? 'bg-hec-950 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-t border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-500">Position du bâtiment</p>
              {picked ? (
                <p className="text-sm font-medium text-hec-900">
                  Latitude&nbsp;: {picked[1].toFixed(6)} · Longitude&nbsp;: {picked[0].toFixed(6)}
                </p>
              ) : (
                <p className="text-xs text-slate-400">Aucun point sélectionné pour le moment.</p>
              )}
              {picked && !pickedValid && (
                <p className="text-xs font-medium text-red-500">
                  Coordonnées invalides — repositionnez le point avant d’enregistrer.
                </p>
              )}
            </div>
            {picked && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => setPicked(null)}
                disabled={saving}
              >
                Repositionner
              </Button>
            )}
          </div>

          {picked && (
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-xl bg-slate-50 p-2.5">
              <label className="text-xs text-slate-500">
                Latitude
                <input
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  inputMode="decimal"
                  className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
                />
              </label>
              <label className="text-xs text-slate-500">
                Longitude
                <input
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  inputMode="decimal"
                  className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
                />
              </label>
              <Button type="button" size="sm" disabled={!manualValid || saving} onClick={handleManualApply}>
                Appliquer
              </Button>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600">{error}</div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              disabled={!pickedValid || saving}
              onClick={() => picked && onConfirm(picked)}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}