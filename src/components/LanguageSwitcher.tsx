import { useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { languageNames } from '@/lib/i18n';
import type { Language } from '@/lib/settings-types';

export function LanguageSwitcher({
  compact = false,
  menuPosition = 'up',
}: {
  compact?: boolean;
  /** Direction d'ouverture du menu : 'up' (par défaut, pour la sidebar en
   * bas d'écran) ou 'down' (pour un header en haut d'écran). */
  menuPosition?: 'up' | 'down';
}) {
  const { settings, setLanguage } = useSettings();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-hec-800 dark:bg-hec-900 dark:text-slate-300"
      >
        <Globe className="h-4 w-4" />
        {!compact && <span>{languageNames[settings.language].label}</span>}
        <span className="text-base">{languageNames[settings.language].flag}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute right-0 z-50 w-full min-w-[160px] rounded-xl border border-slate-100 bg-white p-1 shadow-panel dark:border-hec-800 dark:bg-hec-900 ${
              menuPosition === 'up'
                ? 'bottom-full left-0 mb-2 right-auto'
                : 'top-full mt-2'
            }`}
          >
            {(Object.keys(languageNames) as Language[]).map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  setLanguage(lang);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  settings.language === lang
                    ? 'bg-hec-50 text-hec-700 dark:bg-hec-800 dark:text-hec-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-hec-800'
                }`}
              >
                <span className="text-base">{languageNames[lang].flag}</span>
                {languageNames[lang].label}
                {settings.language === lang && (
                  <Check className="ml-auto h-4 w-4 text-hec-500" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
