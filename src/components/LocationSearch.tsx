import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Clock, LocateFixed, Loader2, Search, X } from 'lucide-react';
import type { CampusLocation } from '@/lib/types';
import { searchLocations, suggestClosestLocation, haversine, formatDistance } from '@/lib/nav';
import { toLngLat } from '@/lib/geo-validation';
import { logSearch } from '@/lib/api';
import { LocationCard } from '@/components/LocationCard';
import { EmptyState } from '@/components/ui';

// Nombre maximal de résultats rendus à l'écran : la recherche/le classement
// restent entièrement délégués à searchLocations (aucun ré-ordonnancement
// parallèle ici), on se contente de limiter le rendu DOM pour rester fluide
// sur un campus avec beaucoup de lieux.
const MAX_RESULTS = 30;
const MAX_NEARBY = 15;
// Léger débounce pour éviter de relancer la recherche à chaque frappe sur
// un jeu de données volumineux — les données restent locales (déjà
// chargées), ce n'est donc pas un appel réseau, juste un lissage du calcul.
const SEARCH_DEBOUNCE_MS = 150;

export function LocationSearch({
  locations,
  recent,
  onSelect,
  autoFocus,
  initialQuery = '',
  placeholder = 'Rechercher une salle, un bureau, un service…',
}: {
  locations: CampusLocation[];
  recent: string[];
  onSelect: (location: CampusLocation) => void;
  autoFocus?: boolean;
  /** Pré-remplit la recherche, par ex. depuis la landing page ou une carte
   * "Trouvez rapidement" du dashboard (?q=... dans l'URL). */
  initialQuery?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const [activeIndex, setActiveIndex] = useState(-1);

  const [nearbyMode, setNearbyMode] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Si la query initiale change (nouvelle navigation depuis l'accueil vers
  // une recherche différente pendant que la page reste montée), on la
  // reprend — sans jamais écraser une saisie manuelle de l'utilisateur.
  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Nettoyage minimal (espaces superflus) avant d'interroger le moteur de
  // recherche existant — la normalisation casse/accents reste de la
  // responsabilité de searchLocations, pour ne pas dupliquer cette logique.
  const cleanedQuery = debouncedQuery.trim().replace(/\s+/g, ' ');

  const rawResults = useMemo(
    () => searchLocations(locations, cleanedQuery),
    [locations, cleanedQuery],
  );

  // "Vouliez-vous dire…" (ÉTAPE 17) : calculé uniquement quand la
  // recherche floue de `searchLocations` n'a rien trouvé — jamais une
  // suggestion inventée, juste le nom réel le plus proche orthographiquement.
  const suggestion = useMemo(
    () => (cleanedQuery && rawResults.length === 0 ? suggestClosestLocation(locations, cleanedQuery) : null),
    [locations, cleanedQuery, rawResults.length],
  );

  // Mode "à proximité" : ne trie que les lieux avec de vraies coordonnées
  // valides (jamais [0,0]/NaN), calcule la distance réelle par Haversine
  // par rapport à la position GPS de l'utilisateur, et ne fait que
  // réordonner — sans jamais inventer ou filtrer arbitrairement les autres
  // champs déjà déterminés par searchLocations.
  const withDistance = (list: CampusLocation[]) => {
    if (!nearbyMode || !userPos) return list.map((l) => ({ location: l, distance: null as number | null }));
    return list
      .filter((l) => toLngLat(l.lng, l.lat) !== null)
      .map((l) => ({ location: l, distance: haversine(userPos, [l.lng, l.lat]) }))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  };

  const queryResults = withDistance(rawResults).slice(0, MAX_RESULTS);
  const nearbyBrowseResults =
    !cleanedQuery && nearbyMode && userPos ? withDistance(locations).slice(0, MAX_NEARBY) : [];

  const visibleResults = cleanedQuery ? queryResults : nearbyBrowseResults;

  useEffect(() => {
    setActiveIndex(visibleResults.length > 0 ? 0 : -1);
  }, [cleanedQuery, visibleResults.length, nearbyMode]);

  const commit = (location: CampusLocation) => {
    logSearch(query || location.name).catch(() => undefined);
    onSelect(location);
  };

  function requestNearby() {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setNearbyError('La géolocalisation n’est pas disponible sur cet appareil.');
      return;
    }
    setNearbyLoading(true);
    setNearbyError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        if (!toLngLat(coords[0], coords[1])) {
          setNearbyError('Position GPS invalide, réessayez.');
          setNearbyLoading(false);
          return;
        }
        setUserPos(coords);
        setNearbyMode(true);
        setNearbyLoading(false);
      },
      () => {
        setNearbyError('Impossible d’obtenir votre position.');
        setNearbyLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function toggleNearby() {
    if (nearbyMode) {
      setNearbyMode(false);
      return;
    }
    if (userPos) {
      setNearbyMode(true);
      return;
    }
    requestNearby();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (visibleResults.length === 0) {
      if (e.key === 'Escape' && query) {
        e.preventDefault();
        setQuery('');
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % visibleResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? visibleResults.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < visibleResults.length) {
        e.preventDefault();
        commit(visibleResults[activeIndex].location);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) {
        setQuery('');
      } else {
        inputRef.current?.blur();
      }
    }
  }

  const activeOptionId =
    activeIndex >= 0 && activeIndex < visibleResults.length
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={visibleResults.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          autoComplete="off"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-10 text-sm font-medium text-hec-950 shadow-sm placeholder:text-slate-400 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100"
            aria-label="Effacer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleNearby}
          aria-pressed={nearbyMode}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            nearbyMode
              ? 'border-hec-400 bg-hec-50 text-hec-700'
              : 'border-slate-200 bg-white text-slate-600 hover:border-hec-200 hover:text-hec-600'
          }`}
        >
          {nearbyLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LocateFixed className="h-3.5 w-3.5" />
          )}
          À proximité
        </button>
        {nearbyError && <span className="text-xs font-medium text-red-500">{nearbyError}</span>}
      </div>

      <div className="no-scrollbar mt-3 flex-1 overflow-y-auto">
        {!cleanedQuery && !nearbyMode && recent.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Recherches récentes
            </p>
            <div className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <button
                  key={r}
                  onClick={() => setQuery(r)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-hec-200 hover:text-hec-600"
                >
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {cleanedQuery && visibleResults.length === 0 && (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="Aucun lieu trouvé"
            description={`Rien ne correspond à « ${cleanedQuery} ». Essayez un code de salle ou un nom de bâtiment.`}
          />
        )}

        {!cleanedQuery && nearbyMode && !nearbyLoading && visibleResults.length === 0 && (
          <EmptyState
            icon={<LocateFixed className="h-5 w-5" />}
            title="Aucun lieu trouvé"
            description="Aucun lieu à coordonnées valides n’a pu être trouvé autour de votre position."
          />
        )}

        {suggestion && (
          <button
            onClick={() => setQuery(suggestion.name)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-hec-200 bg-hec-50 px-3 py-1.5 text-sm font-medium text-hec-700 hover:bg-hec-100"
          >
            Vouliez-vous dire « {suggestion.name} » ?
          </button>
        )}

        <div id={listboxId} role="listbox" aria-label="Résultats de recherche" className="space-y-2">
          {visibleResults.map(({ location, distance }, idx) => (
            <div
              key={location.id}
              id={`${listboxId}-option-${idx}`}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`rounded-2xl ${idx === activeIndex ? 'ring-2 ring-hec-300' : ''}`}
            >
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <LocationCard location={location} onClick={() => commit(location)} />
                </div>
                {distance !== null && (
                  <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-hec-500">
                    {formatDistance(distance)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {!cleanedQuery && !nearbyMode && recent.length === 0 && (
          <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center text-sm text-slate-500">
            Commencez à taper pour explorer le campus HEC.
          </div>
        )}
      </div>
    </div>
  );
}