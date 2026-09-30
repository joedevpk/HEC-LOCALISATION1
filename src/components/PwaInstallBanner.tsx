import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { promptPwaInstall, usePwaInstallAvailable, isIos, isRunningStandalone } from '@/lib/pwa-install';

const DISMISS_KEY = 'hec_pwa_banner_dismissed';

/**
 * Bannière discrète et fermable proposant l'installation de l'app.
 * Réutilisée sur l'accueil (DashboardPage) et la page de bienvenue
 * (LandingPage) — Réglages > À propos garde sa propre version non
 * fermable (bouton/texte directement dans la section, voir
 * SettingsPage.tsx), car là l'utilisateur est déjà venu la chercher.
 *
 * N'affiche jamais un état inventé : rien ne s'affiche tant que le
 * navigateur n'a pas réellement proposé l'installation (Android/Chrome)
 * ou si l'appareil n'est pas iOS — et plus rien après fermeture ou
 * installation (mémorisé en local, comme l'onboarding déjà présent dans
 * AppShell.tsx).
 */
export function PwaInstallBanner({ className = '' }: { className?: string }) {
  const androidAvailable = usePwaInstallAvailable();
  const iosHelp = isIos() && !isRunningStandalone();
  const [dismissed, setDismissed] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1',
  );
  const [installing, setInstalling] = useState(false);

  if (dismissed || (!androidAvailable && !iosHelp)) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Stockage indisponible (mode privé strict, quota…) : la bannière
      // réapparaîtra à la prochaine visite, sans casser l'interaction.
    }
  };

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const accepted = await promptPwaInstall();
      if (accepted) dismiss();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-2xl border border-hec-100 bg-hec-50 p-4 sm:p-5 ${className}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-hec-950 text-white">
          <Download className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-hec-950">Installer HEC Localisation</p>
          <p className="mt-0.5 text-sm text-slate-600">
            {androidAvailable
              ? "Ajoutez l'app à votre écran d'accueil pour un accès plus rapide."
              : "Sur iPhone/iPad : appuyez sur Partager, puis sur « Sur l'écran d'accueil »."}
          </p>
          {androidAvailable && (
            <Button
              size="sm"
              className="mt-3"
              onClick={handleInstall}
              loading={installing}
              icon={<Download className="h-4 w-4" />}
            >
              Installer
            </Button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Masquer cette suggestion"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
