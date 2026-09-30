// src/components/GeoDiagnosticPanel.tsx
// ---------------------------------------------------------------------
// Outil de diagnostic GPS, réservé au développement (rendu uniquement
// quand `import.meta.env.DEV` est vrai — jamais en production, voir le
// point d'appel dans MapPage).
//
// Affiche exactement ce que le pipeline GPS réel (lib/geolocation.ts) a
// reçu et calculé, sans rien reformuler ni arrondir différemment — même
// esprit que AdminDiagnosticPanel ("l'état réel côté React, pas ce qui
// est supposé"). Ne déclenche aucune géolocalisation par lui-même.
//
// UX (passe de finition) : replié par défaut en une simple pastille
// discrète — il ne doit jamais s'imposer au-dessus de la carte au
// chargement. Un clic l'ouvre en overlay compact ; le bouton "×" (vrai
// <button>, aria-label explicite) le referme sans toucher au watcher GPS
// ni à aucune valeur affichée : ce composant est purement présentationnel,
// `status`/`fix`/`message`/`permission` continuent d'être calculés
// exactement comme avant dans MapPage.
// ---------------------------------------------------------------------

import { useState } from 'react';
import { Bug, X } from 'lucide-react';
import type { GeoFix, GeolocationPermissionState } from '@/lib/geolocation';
import { accuracyTierLabels, formatAccuracy } from '@/lib/geolocation';

export function GeoDiagnosticPanel({
  status,
  fix,
  message,
  permission,
}: {
  status: string;
  fix: GeoFix | null;
  message: string | null;
  permission: GeolocationPermissionState | null;
}) {
  // Fermé par défaut : un outil dev ne doit jamais s'afficher automatiquement
  // au-dessus de la carte à chaque chargement de page.
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le diagnostic GPS (dev uniquement)"
        title="Diagnostic GPS (dev uniquement)"
        className="absolute bottom-4 left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-amber-400 shadow-glass transition-colors hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        <Bug className="h-4 w-4" />
      </button>
    );
  }

  const rows: { label: string; value: string }[] = [
    { label: 'geoStatus', value: status },
    { label: 'Permission (Permissions API)', value: permission ?? '(non interrogée)' },
    { label: 'Latitude', value: fix ? fix.lat.toFixed(6) : '—' },
    { label: 'Longitude', value: fix ? fix.lng.toFixed(6) : '—' },
    { label: 'Accuracy', value: fix ? `${fix.accuracy.toFixed(1)} m (${formatAccuracy(fix.accuracy)})` : '—' },
    { label: 'Palier', value: fix ? accuracyTierLabels[fix.tier] : '—' },
    { label: 'Heading', value: fix?.heading != null ? `${fix.heading.toFixed(1)}°` : '—' },
    { label: 'Speed', value: fix?.speed != null ? `${fix.speed.toFixed(2)} m/s` : '—' },
    { label: 'Timestamp', value: fix ? new Date(fix.timestamp).toLocaleTimeString() : '—' },
    { label: 'Message affiché', value: message ?? '(aucun)' },
  ];

  return (
    <>
      {/* Zone invisible derrière le panneau : un tap en dehors le referme
          aussi, en plus du bouton "×" — plus rapide à dégager de la carte
          par erreur/habitude. Purement présentationnel. */}
      <div
        className="fixed inset-0 z-20"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div className="absolute bottom-4 left-4 z-30 max-w-xs rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-white shadow-glass">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-400">
            <Bug className="h-3.5 w-3.5" />
            Diagnostic GPS (dev uniquement)
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Fermer le diagnostic GPS"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <dl className="mt-2 space-y-1 text-[11px]">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-3">
              <dt className="text-slate-400">{r.label}</dt>
              <dd className="text-right font-mono text-slate-100">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
