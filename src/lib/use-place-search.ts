import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GeocodeError,
  MIN_QUERY_LENGTH,
  normalizeQuery,
  resolveGeocoder,
  searchPlaces,
  type GeocoderConfig,
  type PlaceResult,
} from '@/lib/geocoding';

const AUTOCOMPLETE_DEBOUNCE_MS = 450;

export type PlaceSearchStatus = 'idle' | 'loading' | 'done' | 'error';

export interface PlaceSearchState {
  config: GeocoderConfig;
  status: PlaceSearchStatus;
  results: PlaceResult[];
  error: GeocodeError | null;
  /** Requête à laquelle correspondent `results` / `error`. */
  searched: string;
  /** Lance (ou relance) la recherche pour la saisie courante. */
  run: () => void;
}

/**
 * Recherche géographique avec délai de saisie (autocomplétion) pour les
 * fournisseurs qui l'autorisent, ou déclenchement manuel (Nominatim : pas
 * d'autocomplétion permise). Annule la requête précédente, ne bloque jamais
 * l'interface : une erreur reste locale à la section « lieux publics ».
 */
/**
 * Pause des requêtes AUTOMATIQUES (autocomplétion) après un refus du fournisseur : sans elle,
 * chaque frappe relançait une requête vouée à l'échec (clé refusée = 403 à chaque lettre ;
 * quota atteint = on l'aggrave). Le bouton « Réessayer » (run) reste utilisable immédiatement.
 */
export function autocompleteCooldownMs(kind: GeocodeError['kind'] | undefined): number {
  if (kind === 'forbidden') return 60_000;
  if (kind === 'rate_limited') return 15_000;
  return 0;
}

export function usePlaceSearch(query: string, proximity?: [number, number]): PlaceSearchState {
  const config = useMemo(() => resolveGeocoder(), []);
  const [state, setState] = useState<Omit<PlaceSearchState, 'config' | 'run'>>({
    status: 'idle',
    results: [],
    error: null,
    searched: '',
  });
  const abortRef = useRef<AbortController | null>(null);
  const blockedUntilRef = useRef(0);
  const proxKey = proximity ? `${proximity[0]},${proximity[1]}` : '';
  const proxRef = useRef(proximity);
  proxRef.current = proximity;
  const cleaned = normalizeQuery(query);

  const execute = useCallback(
    (q: string) => {
      if (config.provider === 'none' || q.length < MIN_QUERY_LENGTH) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState((s) => ({ ...s, status: 'loading', error: null, searched: q }));
      searchPlaces(q, { config, proximity: proxRef.current, signal: controller.signal })
        .then((results) => {
          if (abortRef.current !== controller) return;
          setState({ status: 'done', results, error: null, searched: q });
        })
        .catch((err: unknown) => {
          if (abortRef.current !== controller) return;
          if (err instanceof GeocodeError && err.kind === 'abort') return;
          const e = err instanceof GeocodeError ? err : new GeocodeError('Recherche de lieux impossible.', 'network_error');
          blockedUntilRef.current = Date.now() + autocompleteCooldownMs(e.kind);
          setState({ status: 'error', results: [], error: e, searched: q });
        });
    },
    [config],
  );

  useEffect(() => {
    if (config.provider === 'none') return;
    if (cleaned.length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort();
      abortRef.current = null;
      setState({ status: 'idle', results: [], error: null, searched: '' });
      return;
    }
    if (!config.autocomplete) {
      // Mode manuel : une nouvelle saisie invalide l'ancien résultat sans appeler le service.
      setState((s) => (s.searched !== cleaned ? { status: 'idle', results: [], error: null, searched: '' } : s));
      return;
    }
    const t = window.setTimeout(() => {
      if (Date.now() < blockedUntilRef.current) return; // pause après refus : voir autocompleteCooldownMs
      execute(cleaned);
    }, AUTOCOMPLETE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [cleaned, config, execute, proxKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(() => execute(cleaned), [execute, cleaned]);
  return { config, ...state, run };
}
