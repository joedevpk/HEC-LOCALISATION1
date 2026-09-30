import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  BookOpen,
  DoorOpen,
  MapPinned,
  Search as SearchIcon,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCampus } from '@/context/CampusContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, useRoute } from '@/lib/router';
import { LocationSearch } from '@/components/LocationSearch';
import { getRecentSearches } from '@/lib/api';
import type { LocationKind } from '@/lib/types';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui';
import { HEC_PHOTOS } from '@/lib/hec-images';

const kindLabels: Partial<Record<LocationKind, string>> = {
  room: 'Salles',
  office: 'Bureaux',
  service: 'Services',
  poi: "Points d'intérêt",
  facility: 'Équipements',
};

// Catégories d'exploration : uniquement des filtres sur les données existantes.
const exploreCategories: Array<{
  label: string;
  icon: LucideIcon;
  go?: string;
  kind?: LocationKind;
  q?: string;
}> = [
  { label: 'Bâtiments', icon: Building2, go: '/map' },
  { label: 'Services', icon: ShieldCheck, kind: 'service' },
  { label: 'Salles', icon: DoorOpen, kind: 'room' },
  { label: 'Bibliothèque', icon: BookOpen, q: 'bibliothèque' },
  { label: 'Bureaux', icon: Users, kind: 'office' },
  { label: "Points d'intérêt", icon: MapPinned, kind: 'poi' },
];

export function SearchPage() {
  const { locations, loading: campusLoading, error: campusError, reload } = useCampus();
  const { session } = useAuth();
  const route = useRoute();
  const go = useNavigate();
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (session) {
      getRecentSearches(session.user.id)
        .then(setRecent)
        .catch(() => undefined);
    }
  }, [session]);

  const initialQuery = route.params.get('q') ?? '';
  const kind = route.params.get('kind') as LocationKind | null;

  // Une carte "Trouvez rapidement" (accueil/dashboard) peut filtrer par
  // nature de lieu (salle, bureau, service, POI) plutôt que par texte.
  const scopedLocations = useMemo(
    () => (kind ? locations.filter((loc) => loc.kind === kind) : locations),
    [locations, kind],
  );

  const activeKindLabel = kind ? kindLabels[kind] : null;
  const title = activeKindLabel ?? 'Recherche';
  const subtitle = activeKindLabel
    ? `Tous les résultats de type « ${activeKindLabel} » sur le campus.`
    : "Trouvez une salle, un bureau, un service ou un point d'intérêt.";

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8 lg:py-10">
      {/* Hero visuel : photo réelle du campus */}
      <div className="relative isolate mb-6 overflow-hidden rounded-3xl bg-hec-950 px-6 py-8 text-white shadow-panel sm:px-8 sm:py-10">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <img
            src={HEC_PHOTOS.buildingFacade.small}
            srcSet={`${HEC_PHOTOS.buildingFacade.small} 480w, ${HEC_PHOTOS.buildingFacade.src} 810w`}
            sizes="(min-width: 1024px) 48rem, 100vw"
            alt=""
            decoding="async"
            style={{ objectPosition: 'center 40%' }}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-hec-950/95 via-hec-950/75 to-hec-950/40" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-hec-200">Explorer</p>
        <p className="mt-1 max-w-md font-display text-2xl font-bold leading-tight text-white sm:text-3xl">
          Explorez le campus, lieu par lieu.
        </p>
      </div>

      {!activeKindLabel && !initialQuery && (
        <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {exploreCategories.map((c) => (
            <button
              key={c.label}
              onClick={() => (c.go ? go(c.go) : go('/search', c.kind ? { kind: c.kind } : { q: c.q as string }))}
              className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-slate-100 bg-white px-3.5 py-3 text-left text-sm font-semibold text-hec-950 transition-all hover:-translate-y-0.5 hover:border-hec-100 hover:shadow-glass focus:outline-none focus-visible:ring-4 focus-visible:ring-hec-200 motion-reduce:transform-none"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-hec-50 text-hec-600">
                <c.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-start gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-hec-950 text-white dark:bg-white dark:text-hec-950">
          <SearchIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-bold text-hec-950 dark:text-white">
            {title}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>

      {activeKindLabel && (
        <button
          onClick={() => go('/search', initialQuery ? { q: initialQuery } : {})}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-hec-100 bg-hec-50 px-3 py-1.5 text-xs font-semibold text-hec-700 transition-colors hover:bg-hec-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {activeKindLabel}
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {campusLoading ? (
        <div className="mt-6"><SkeletonList rows={5} /></div>
      ) : campusError ? (
        <div className="mt-6">
          <ErrorState
            title="Une erreur est survenue."
            description="Impossible de charger les lieux du campus."
            onRetry={reload}
          />
        </div>
      ) : locations.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<SearchIcon className="h-5 w-5" />}
            title="Aucun lieu référencé"
            description="Les lieux du campus apparaîtront ici dès qu'ils auront été ajoutés par l'administration."
          />
        </div>
      ) : (
      <div className="mt-6 h-[70vh] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-panel dark:border-slate-800 dark:bg-slate-900">
        <LocationSearch
          locations={scopedLocations}
          recent={recent}
          initialQuery={initialQuery}
          onSelect={(loc) => go('/map', { loc: loc.id })}
          autoFocus
        />
      </div>
      )}
    </div>
  );
}