import { AlertTriangle, Loader2, MapPin, RefreshCw, Search } from 'lucide-react';
import type { PlaceResult } from '@/lib/geocoding';
import { MIN_QUERY_LENGTH, normalizeQuery } from '@/lib/geocoding';
import type { PlaceSearchState } from '@/lib/use-place-search';

/**
 * Résultats de la recherche géographique réelle (rues, établissements, lieux
 * publics), affichés SOUS les lieux du campus. Toute erreur reste locale à
 * cette section : elle ne bloque ni la carte ni la recherche du campus.
 */
export function PlaceSearchSection({
  query,
  search,
  onPick,
}: {
  query: string;
  search: PlaceSearchState;
  onPick: (place: PlaceResult) => void;
}) {
  const q = normalizeQuery(query);
  if (q.length < MIN_QUERY_LENGTH) return null;

  const attribution =
    search.config.provider === 'maptiler'
      ? 'Recherche MapTiler · données © contributeurs OpenStreetMap'
      : 'Recherche Nominatim · données © contributeurs OpenStreetMap';

  return (
    <section aria-label="Autres lieux à Kinshasa" className="mt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Autres lieux (rues, établissements)
      </h3>

      {search.config.provider === 'none' && (
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          La recherche de rues et de lieux publics n'est pas activée sur ce serveur.
        </p>
      )}

      {search.config.provider !== 'none' && !search.config.autocomplete && search.searched !== q && search.status !== 'loading' && (
        <button
          type="button"
          onClick={search.run}
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-hec-200 bg-hec-50 px-3 text-sm font-semibold text-hec-700 hover:bg-hec-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
        >
          <Search className="h-4 w-4" />
          Rechercher « {q} » dans les lieux publics
        </button>
      )}

      {search.status === 'loading' && (
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          Recherche en cours…
        </p>
      )}

      {search.status === 'error' && search.error && (
        <div role="alert" className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{search.error.message}</span>
          {search.error.kind !== 'not_configured' && search.error.kind !== 'forbidden' && (
            <button
              type="button"
              onClick={search.run}
              className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-white px-2.5 font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
            >
              <RefreshCw className="h-3 w-3" />
              Réessayer
            </button>
          )}
        </div>
      )}

      {search.status === 'done' && search.results.length === 0 && (
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Aucun lieu public trouvé pour « {search.searched} ».
        </p>
      )}

      {search.status === 'done' && search.results.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {search.results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2 text-left shadow-sm hover:border-hec-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-hec-50 text-hec-600" aria-hidden="true">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-hec-950">{p.name}</span>
                  {p.label !== p.name && <span className="block truncate text-xs text-slate-500">{p.label}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {search.config.provider !== 'none' && search.status === 'done' && (
        <p className="mt-2 text-[10px] text-slate-400">{attribution}</p>
      )}
    </section>
  );
}
