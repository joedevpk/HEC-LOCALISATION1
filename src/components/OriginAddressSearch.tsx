import { useState } from 'react';
import { AlertTriangle, Check, Loader2, MapPin, Search } from 'lucide-react';
import type { PlaceResult } from '@/lib/geocoding';
import { MIN_QUERY_LENGTH, normalizeQuery } from '@/lib/geocoding';
import { usePlaceSearch } from '@/lib/use-place-search';

/**
 * Départ par ADRESSE / lieu recherché. Principes :
 *  - seuls les résultats réellement renvoyés par le service de recherche (avec coordonnées valides) sont proposés ;
 *  - rien n'est choisi automatiquement : l'utilisateur confirme explicitement un résultat, surtout
 *    lorsqu'il y en a plusieurs (adresse ambiguë) ;
 *  - un résultat « approximatif » (quartier, commune, rue entière) est signalé comme tel : le point
 *    est un centre représentatif, pas une adresse exacte.
 */
export function OriginAddressSearch({
  proximity,
  onConfirm,
}: {
  proximity?: [number, number];
  onConfirm: (place: PlaceResult) => void;
}) {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<PlaceResult | null>(null);
  const search = usePlaceSearch(query, proximity);
  const q = normalizeQuery(query);
  const disabled = search.config.provider === 'none';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Départ depuis une adresse ou un lieu
        </span>
        <div className="mt-1 flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-hec-400 focus-within:ring-4 focus-within:ring-hec-100">
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <input
            type="search"
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value);
              setPending(null);
            }}
            placeholder={disabled ? 'Recherche d’adresses non activée' : 'Ex. avenue, quartier, établissement…'}
            className="min-w-0 flex-1 bg-transparent text-sm text-hec-950 placeholder:text-slate-500 focus:outline-none"
            autoComplete="off"
          />
        </div>
      </label>

      {disabled && (
        <p className="mt-2 text-xs text-slate-600">
          La recherche d’adresses n’est pas configurée sur ce serveur : choisissez votre position, un lieu du campus
          ou un point sur la carte.
        </p>
      )}

      {!disabled && q.length >= MIN_QUERY_LENGTH && !search.config.autocomplete && search.searched !== q && search.status !== 'loading' && (
        <button
          type="button"
          onClick={search.run}
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-hec-200 bg-hec-50 px-3 text-sm font-semibold text-hec-700 hover:bg-hec-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
        >
          <Search className="h-4 w-4" /> Rechercher « {q} »
        </button>
      )}

      {search.status === 'loading' && (
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-600" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Recherche en cours…
        </p>
      )}

      {search.status === 'error' && search.error && (
        <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {search.error.message}
        </p>
      )}

      {search.status === 'done' && search.searched === q && search.results.length === 0 && (
        <p className="mt-2 text-xs text-slate-600" role="status">
          Aucun résultat pour « {q} ». Aucune position n’a été déduite : précisez l’adresse ou choisissez le départ
          sur la carte.
        </p>
      )}

      {search.status === 'done' && search.searched === q && search.results.length > 1 && !pending && (
        <p className="mt-2 text-xs font-medium text-slate-700">
          Plusieurs résultats : choisissez celui qui correspond à votre départ.
        </p>
      )}

      {!pending && search.status === 'done' && search.searched === q && search.results.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Résultats de recherche pour le départ">
          {search.results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setPending(r)}
                className="flex min-h-11 w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-hec-600" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block break-words font-semibold text-hec-950">{r.name}</span>
                  {r.label !== r.name && <span className="block break-words text-xs text-slate-600">{r.label}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <div className="mt-3 rounded-lg border border-hec-200 bg-hec-50 p-3" role="group" aria-label="Confirmer le point de départ">
          <p className="break-words text-sm font-semibold text-hec-950">{pending.name}</p>
          {pending.label !== pending.name && <p className="break-words text-xs text-slate-700">{pending.label}</p>}
          <p className="mt-1 text-xs text-slate-700">
            Position : {pending.lat.toFixed(5)}, {pending.lng.toFixed(5)}
          </p>
          {pending.precision === 'approximate' && (
            <p className="mt-2 flex items-start gap-2 text-xs font-medium text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Résultat approximatif (zone, rue ou quartier) : le point de départ est un centre représentatif, pas
              une adresse exacte.
            </p>
          )}
          {pending.precision === undefined && (
            <p className="mt-2 flex items-start gap-2 text-xs text-slate-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Précision non communiquée par le service de recherche.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onConfirm(pending);
                setPending(null);
                setQuery('');
              }}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-hec-600 px-3 text-sm font-semibold text-white hover:bg-hec-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hec-100"
            >
              <Check className="h-4 w-4" /> Partir d’ici
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-hec-100"
            >
              Autre résultat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
