import { useEffect, useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import type { ThemeMode } from '@/lib/settings-types';

/**
 * Sélecteur de thème (Clair / Sombre / Système) pour la navbar publique.
 *
 * IMPORTANT : ne crée AUCUN second système de thème. Il lit et écrit
 * exclusivement `settings.theme` / `setTheme` de SettingsContext, qui
 * applique la classe `dark` sur <html>, persiste le choix (localStorage +
 * Supabase si connecté) et suit le réglage système en mode « Système ».
 */
const OPTIONS: { value: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Clair', Icon: Sun },
  { value: 'dark', label: 'Sombre', Icon: Moon },
  { value: 'system', label: 'Système', Icon: Monitor },
];

function currentIcon(theme: ThemeMode) {
  return (OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2]).Icon;
}

/** Bouton compact + petit menu (desktop, barre de navigation). */
export function ThemeToggle({ buttonClass = '' }: { buttonClass?: string }) {
  const { settings, setTheme } = useSettings();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const Icon = currentIcon(settings.theme);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Changer le thème d'affichage"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`grid h-11 w-11 place-items-center rounded-xl transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-hec-300/50 ${buttonClass}`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Thème d'affichage"
          className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-panel animate-scale-in"
        >
          {OPTIONS.map(({ value, label, Icon: OptIcon }) => {
            const selected = settings.theme === value;
            return (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setTheme(value);
                  setOpen(false);
                }}
                className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hec-400 ${
                  selected ? 'bg-hec-50 text-hec-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <OptIcon className="h-4 w-4" aria-hidden="true" />
                {label}
                {selected && <Check className="ml-auto h-4 w-4 text-hec-500" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Version étendue (3 boutons étiquetés) pour le menu mobile. */
export function ThemeSegmented() {
  const { settings, setTheme } = useSettings();
  return (
    <div role="radiogroup" aria-label="Thème d'affichage" className="grid grid-cols-3 gap-2">
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = settings.theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl border text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-hec-200 ${
              selected
                ? 'border-hec-500 bg-hec-50 text-hec-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
