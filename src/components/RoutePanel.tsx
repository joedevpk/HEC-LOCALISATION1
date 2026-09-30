import {
  Accessibility,
  AlertTriangle,
  ChevronDown,
  Clock,
  Footprints,
  LocateFixed,
  Loader2,
  Navigation,
  Pencil,
  Route as RouteIcon,
  Waypoints,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CampusLocation } from '@/lib/types';
import type { RouteResult } from '@/lib/nav';
import { formatDistance } from '@/lib/nav';

/**
 * ÉTAPE 12 : le panneau gère maintenant explicitement trois états —
 * initial (pas encore de route calculée), erreur, et route disponible —
 * plutôt que de supposer qu'une route valide est toujours présente. Toutes
 * les nouvelles capacités (démarrer, recentrer, modifier la destination,
 * navigation active) sont exposées via des props OPTIONNELLES : un appelant
 * qui ne les fournit pas retrouve exactement le comportement précédent,
 * aucune modification de MapPage n'est donc requise pour que ce fichier
 * compile et fonctionne tel quel.
 */
export function RoutePanel({
  origin,
  destination,
  route,
  accessible,
  origins,
  onChangeOrigin,
  onToggleAccessible,
  onClose,
  loading = false,
  error = null,
  onUseMyLocation,
  onStart,
  onRecenter,
  onChangeDestination,
  navigation = null,
  warning = null,
}: {
  /** `null` tant qu'aucun point de départ n'a été choisi (état initial). */
  origin: CampusLocation | null;
  destination: CampusLocation;
  /** `null` tant qu'aucune route n'a été calculée avec succès — jamais une route fictive. */
  route: RouteResult | null;
  accessible: boolean;
  origins: CampusLocation[];
  onChangeOrigin: (id: string) => void;
  onToggleAccessible: () => void;
  onClose: () => void;
  /** Calcul de route en cours côté appelant. */
  loading?: boolean;
  /** Message d'erreur réel déjà formé par l'appelant (pas de GPS, aucun
   * réseau piéton, aucune route trouvée, destination inaccessible…) — ce
   * composant ne devine jamais la cause, il l'affiche telle quelle. */
  error?: string | null;
  /** Bouton "Ma position" — masqué si non fourni. */
  onUseMyLocation?: () => void;
  /** Bouton "Démarrer" — masqué si non fourni. */
  onStart?: () => void;
  /** Bouton "Recentrer" — masqué si non fourni. */
  onRecenter?: () => void;
  /** Bouton "Modifier" sur la destination — masqué si non fourni. */
  onChangeDestination?: () => void;
  /**
   * État réel de navigation active, fourni par l'appelant s'il en dispose
   * déjà (position courante suivie, étape en cours). Ne jamais simuler
   * cet objet ici : en son absence, le panneau reste statique comme avant.
   */
  navigation?: {
    currentStepIndex: number;
    /** Distance réelle jusqu'à la prochaine étape, si connue. */
    distanceToNextStepMeters: number | null;
  } | null;
  /**
   * Avertissement NON bloquant affiché au-dessus de l'itinéraire calculé
   * (ex. position de départ GPS trop imprécise pour un itinéraire
   * présenté comme précis) — contrairement à `error`, ne remplace jamais
   * le contenu de la route : celle-ci reste réelle et affichée, juste
   * clairement qualifiée. `null`/omis : rien ne s'affiche.
   */
  warning?: string | null;
}) {
  const hasDuration = typeof route?.durationMinutes === 'number';
  const hasSteps = !!route && route.steps.length > 0;

  // PHASE 2 UX : Distance/Temps restent l'information principale toujours
  // visible ; le détail pas-à-pas est secondaire et replié par défaut pour
  // ne pas surcharger le panneau (bottom sheet mobile compris). Il s'ouvre
  // automatiquement dès qu'une navigation active est fournie, pour ne
  // jamais masquer l'étape en cours. Purement présentationnel : aucune
  // étape ni distance n'est recalculée ou modifiée ici.
  const [stepsOpen, setStepsOpen] = useState(!!navigation);
  useEffect(() => {
    if (navigation) setStepsOpen(true);
  }, [navigation]);

  return (
    <div className="animate-fade-up" role="region" aria-label="Panneau d’itinéraire">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-hec-500">
          <RouteIcon className="h-5 w-5" />
          <span className="font-display font-bold text-hec-950">Itinéraire</span>
        </div>
        <button
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hec-100"
          aria-label="Fermer l'itinéraire"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-hec-100 bg-hec-50/60 px-3 py-2.5">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-wide text-hec-500">
            Destination
          </span>
          <p className="mt-0.5 text-sm font-semibold text-hec-950">{destination.name}</p>
        </div>
        {onChangeDestination && (
          <button
            onClick={onChangeDestination}
            aria-label="Modifier la destination"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-hec-500 hover:bg-hec-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hec-100"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ---- Erreur réelle transmise par l'appelant ---- */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ---- Chargement du calcul d'itinéraire ---- */}
      {loading && !error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-sm font-medium text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calcul de l’itinéraire…
        </div>
      )}

      {/* ---- État initial : pas encore de route, on demande le départ ---- */}
      {!loading && !error && !route && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold text-hec-950">
            Comment aller à {destination.name} ?
          </p>

          {onUseMyLocation && (
            <button
              onClick={onUseMyLocation}
              className="flex w-full items-center gap-2 rounded-xl border border-hec-200 bg-hec-50 px-3 py-3 text-sm font-semibold text-hec-700 hover:bg-hec-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hec-100"
            >
              <LocateFixed className="h-4 w-4" />
              Utiliser ma position
            </button>
          )}

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Départ
            </span>
            <select
              value={origin?.id ?? ''}
              onChange={(e) => onChangeOrigin(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
            >
              <option value="" disabled>
                Choisir un point de départ…
              </option>
              {origins.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={onToggleAccessible}
            aria-pressed={accessible}
            className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hec-100 ${
              accessible
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
            }`}
          >
            <Accessibility className="h-4 w-4" />
            Itinéraire accessible
            <span className="ml-auto text-xs">{accessible ? 'Activé' : 'Désactivé'}</span>
          </button>
        </div>
      )}

      {/* ---- Route calculée ---- */}
      {!loading && !error && route && origin && (
        <>
          {warning && (
            <div
              role="status"
              className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{warning}</span>
            </div>
          )}
          <div
            className={`mt-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${
              route.usedNetwork
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Waypoints className="h-3.5 w-3.5" />
            {route.usedNetwork
              ? 'Itinéraire calculé sur le réseau réel du campus'
              : "Itinéraire direct (réseau de navigation non défini pour ce trajet)"}
          </div>

          {navigation && (
            <div className="mt-3 rounded-xl bg-hec-950 px-3.5 py-3 text-white">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/60">
                <Navigation className="h-3.5 w-3.5" />
                Étape {navigation.currentStepIndex + 1} / {route.steps.length}
              </div>
              <p className="mt-1 text-sm font-semibold">
                {route.steps[navigation.currentStepIndex] ?? 'Vous êtes arrivé.'}
              </p>
              {navigation.distanceToNextStepMeters !== null && (
                <p className="mt-0.5 text-xs text-white/70">
                  Encore {formatDistance(navigation.distanceToNextStepMeters)} avant la prochaine étape
                </p>
              )}
            </div>
          )}

          <div className="mt-4 space-y-2">
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Départ
              </span>
              <select
                value={origin.id}
                onChange={(e) => onChangeOrigin(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
              >
                {origins.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Footprints className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wide">
                  Distance
                </span>
              </div>
              <p className="mt-0.5 font-display text-lg font-bold text-hec-950">
                {formatDistance(route.distanceMeters)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wide">
                  À pied
                </span>
              </div>
              {/* Jamais de fausse précision : si la durée n'est pas
                  disponible côté routing réel, on l'indique clairement au
                  lieu d'afficher "0 min" ou une estimation inventée. */}
              <p className="mt-0.5 font-display text-lg font-bold text-hec-950">
                {hasDuration ? `${route.durationMinutes} min` : '—'}
              </p>
              {!hasDuration && (
                <p className="text-[11px] text-slate-400">Durée non disponible</p>
              )}
            </div>
          </div>

          <button
            onClick={onToggleAccessible}
            aria-pressed={accessible}
            className={`mt-3 flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hec-100 ${
              accessible
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
            }`}
          >
            <Accessibility className="h-4 w-4" />
            Itinéraire accessible
            <span className="ml-auto text-xs">{accessible ? 'Activé' : 'Désactivé'}</span>
          </button>

          {hasSteps ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setStepsOpen((o) => !o)}
                aria-expanded={stepsOpen}
                className="flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-left text-sm font-semibold text-hec-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hec-100"
              >
                <span>
                  {stepsOpen ? 'Masquer les étapes' : `Voir les ${route.steps.length} étapes`}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform ${stepsOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {stepsOpen && (
                <ol className="mt-2 max-h-64 space-y-3 overflow-y-auto pr-1">
                  {route.steps.map((step, i) => (
                    <li
                      key={i}
                      className={`flex gap-3 rounded-lg px-1 py-0.5 ${
                        navigation && i === navigation.currentStepIndex ? 'bg-hec-50' : ''
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${
                          navigation && i < navigation.currentStepIndex
                            ? 'bg-slate-300'
                            : 'bg-hec-950'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm leading-snug text-slate-600">{step}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">
              Aucune étape disponible pour cet itinéraire.
            </p>
          )}

          {(onStart || onRecenter) && (
            <div className="mt-4 flex gap-2">
              {onStart && (
                <button
                  onClick={onStart}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-hec-950 px-3 py-3 text-sm font-semibold text-white hover:bg-hec-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hec-200"
                >
                  <Navigation className="h-4 w-4" />
                  Démarrer
                </button>
              )}
              {onRecenter && (
                <button
                  onClick={onRecenter}
                  aria-label="Recentrer la carte"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hec-100"
                >
                  <LocateFixed className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}