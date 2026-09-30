import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronRight,
  Globe,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Shield,
  Sun,
  Trash2,
  Type,
  User,
  Download,
  Accessibility,
  Sparkles,
  ShieldCheck,
  MapPin,
  FileDown,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useNavigate, useRoute } from '@/lib/router';
import { clearSearchHistory } from '@/lib/extension-api';
import { promptPwaInstall, usePwaInstallAvailable, isIos, isRunningStandalone } from '@/lib/pwa-install';
import { languageNames } from '@/lib/i18n';
import type { Language, ThemeMode, TextSize } from '@/lib/settings-types';
import { Button } from '@/components/ui';
import { ContactBlock, LEGAL_LINKS } from '@/components/LegalLayout';
import { readPrivacyPrefs, writePrivacyPrefs } from '@/lib/privacy-prefs';
import { collectMyData, downloadMyData, summarize, type MyDataExport } from '@/lib/my-data';

type Section =
  | 'account'
  | 'appearance'
  | 'language'
  | 'notifications'
  | 'accessibility'
  | 'security'
  | 'privacy'
  | 'data'
  | 'about';

const validSections: Section[] = [
  'account',
  'appearance',
  'language',
  'notifications',
  'accessibility',
  'security',
  'privacy',
  'data',
  'about',
];

export function SettingsPage() {
  const { profile, session, signOut } = useAuth();
  const { settings, t, setLanguage, setTheme, updateSettings } = useSettings();
  const go = useNavigate();
  const route = useRoute();
  // Permet d'arriver directement sur un onglet précis, ex. depuis le
  // centre de notifications (?section=notifications) — PHASE 6.
  const initialSection = route.params.get('section');
  const [section, setSection] = useState<Section>(
    validSections.includes(initialSection as Section)
      ? (initialSection as Section)
      : 'account',
  );
  const [cleared, setCleared] = useState(false);
  const pwaInstallAvailable = usePwaInstallAvailable();
  const [pwaInstalling, setPwaInstalling] = useState(false);

  // ---- Confidentialité et données (chaque contrôle = une vraie fonction) ----
  const [saveHistory, setSaveHistory] = useState(() => readPrivacyPrefs().saveSearchHistory);
  const [geoPerm, setGeoPerm] = useState<'granted' | 'prompt' | 'denied' | 'unknown'>('unknown');
  const [myData, setMyData] = useState<MyDataExport | null>(null);
  const [myDataLoading, setMyDataLoading] = useState(false);
  const [myDataError, setMyDataError] = useState<string | null>(null);
  const myDataBusy = useRef(false);

  useEffect(() => {
    if (section !== 'privacy') return;
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const update = () => status && !cancelled && setGeoPerm(status.state as 'granted' | 'prompt' | 'denied');
    // L'API Permissions n'existe pas partout : sinon l'état reste « inconnu »
    // (jamais inventé) et on renvoie vers les réglages du navigateur.
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((st) => {
        status = st;
        update();
        st.addEventListener('change', update);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      status?.removeEventListener('change', update);
    };
  }, [section]);

  const toggleSaveHistory = (value: boolean) => {
    setSaveHistory(value);
    writePrivacyPrefs({ saveSearchHistory: value });
  };

  const loadMyData = async () => {
    if (!session || myDataBusy.current) return;
    myDataBusy.current = true;
    setMyDataLoading(true);
    setMyDataError(null);
    try {
      setMyData(await collectMyData(session.user, profile));
    } catch {
      setMyDataError("Une erreur est survenue. Vos données n'ont pas pu être chargées — réessayez.");
    } finally {
      myDataBusy.current = false;
      setMyDataLoading(false);
    }
  };
  // iOS n'a jamais `beforeinstallprompt` (limitation Apple, pas un bug) :
  // seule une marche à suivre manuelle peut être proposée, et seulement
  // si l'app n'est pas déjà installée.
  const showIosInstallHelp = isIos() && !isRunningStandalone();

  const handleClearHistory = async () => {
    if (!session) return;
    try {
      await clearSearchHistory(session.user.id);
      setCleared(true);
      setMyData(null);
      setTimeout(() => setCleared(false), 2000);
    } catch {
      setMyDataError("Une erreur est survenue. L'historique n'a pas pu être effacé — réessayez.");
    }
  };

  const handleInstallClick = async () => {
    setPwaInstalling(true);
    try {
      await promptPwaInstall();
    } finally {
      setPwaInstalling(false);
    }
  };

  const sections: { id: Section; label: string; icon: typeof User }[] = [
    { id: 'account', label: t('settings.account'), icon: User },
    { id: 'appearance', label: t('settings.appearance'), icon: Palette },
    { id: 'language', label: t('settings.language'), icon: Globe },
    { id: 'notifications', label: t('settings.notifications'), icon: Bell },
    { id: 'accessibility', label: t('settings.accessibility'), icon: Accessibility },
    { id: 'security', label: t('settings.security'), icon: Shield },
    { id: 'privacy', label: 'Confidentialité et données', icon: ShieldCheck },
    { id: 'data', label: t('settings.data'), icon: Download },
    { id: 'about', label: t('settings.about'), icon: Sparkles },
  ];

  return (
    <div className="mx-auto max-w-4xl px-5 py-6 lg:px-8 lg:py-10">
      <h1 className="font-display text-2xl font-bold text-hec-950">
        {t('settings.title')}
      </h1>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* Section list */}
        <div className="lg:w-56 lg:shrink-0">
          <div className="flex gap-1 overflow-x-auto no-scrollbar lg:flex-col">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`inline-flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  section === s.id
                    ? 'bg-hec-950 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                <s.icon className="h-4 w-4" />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Section content */}
        <div className="flex-1">
          {section === 'account' && (
            <Card title={t('settings.account')}>
              <Row label={t('settings.fullName')} value={profile?.full_name ?? '—'} />
              <Row label={t('settings.email')} value={session?.user?.email ?? '—'} />
              <Row label={t('settings.role')} value={profile?.role ?? 'VISITOR'} />
              <Row
                label={t('settings.memberSince')}
                value={
                  profile?.created_at
                    ? new Date(profile.created_at).toLocaleDateString('fr-FR')
                    : '—'
                }
              />
              <div className="mt-4">
                <Button
                  variant="secondary"
                  icon={<LogOut className="h-4 w-4" />}
                  onClick={() => signOut().then(() => go('/'))}
                >
                  {t('settings.signOut')}
                </Button>
              </div>
            </Card>
          )}

          {section === 'appearance' && (
            <Card title={t('settings.appearance')}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('settings.theme')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(['light', 'dark', 'system'] as ThemeMode[]).map((th) => (
                  <button
                    key={th}
                    onClick={() => setTheme(th)}
                    className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-colors ${
                      settings.theme === th
                        ? 'border-hec-400 bg-hec-50 text-hec-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {th === 'light' && <Sun className="h-5 w-5" />}
                    {th === 'dark' && <Moon className="h-5 w-5" />}
                    {th === 'system' && <Monitor className="h-5 w-5" />}
                    {t(`settings.theme${th.charAt(0).toUpperCase()}${th.slice(1)}`)}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {section === 'language' && (
            <Card title={t('settings.language')}>
              <div className="space-y-2">
                {(Object.keys(languageNames) as Language[]).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                      settings.language === lang
                        ? 'border-hec-400 bg-hec-50 text-hec-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-lg">{languageNames[lang].flag}</span>
                    {languageNames[lang].label}
                    {settings.language === lang && (
                      <ChevronRight className="ml-auto h-4 w-4 text-hec-500" />
                    )}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {section === 'notifications' && (
            <Card title={t('settings.notifications')}>
              <div className="space-y-1">
                {[
                  { key: 'notif_announcements', label: t('settings.notifAnnouncements') },
                  { key: 'notif_events', label: t('settings.notifEvents') },
                  { key: 'notif_room_changes', label: t('settings.notifRoomChanges') },
                  { key: 'notif_courses', label: t('settings.notifCourses') },
                  { key: 'notif_bookings', label: t('settings.notifBookings') },
                  { key: 'notif_maintenance', label: t('settings.notifMaintenance') },
                  { key: 'notif_alerts', label: t('settings.notifAlerts') },
                ].map((n) => (
                  <Toggle
                    key={n.key}
                    label={n.label}
                    checked={settings[n.key as keyof typeof settings] as boolean}
                    onChange={(v) => updateSettings({ [n.key]: v })}
                  />
                ))}
              </div>
            </Card>
          )}

          {section === 'accessibility' && (
            <Card title={t('settings.accessibility')}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('settings.textSize')}
              </p>
              <div className="mb-4 grid grid-cols-3 gap-2">
                {(['small', 'normal', 'large'] as TextSize[]).map((sz) => (
                  <button
                    key={sz}
                    onClick={() => updateSettings({ text_size: sz })}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                      settings.text_size === sz
                        ? 'border-hec-400 bg-hec-50 text-hec-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Type className="h-4 w-4" />
                    {sz}
                  </button>
                ))}
              </div>
              <Toggle
                label={t('settings.highContrast')}
                checked={settings.high_contrast}
                onChange={(v) => updateSettings({ high_contrast: v })}
              />
              <Toggle
                label={t('settings.reduceMotion')}
                checked={settings.reduce_motion}
                onChange={(v) => updateSettings({ reduce_motion: v })}
              />
              <Toggle
                label={t('settings.accessibleNav')}
                checked={settings.accessible_nav}
                onChange={(v) => updateSettings({ accessible_nav: v })}
              />
            </Card>
          )}

          {section === 'security' && (
            <Card title={t('settings.security')}>
              <Row label={t('settings.activeSessions')} value="1 session active" />
              <Row
                label="Dernière connexion"
                value={
                  session?.user?.last_sign_in_at
                    ? new Date(session.user.last_sign_in_at).toLocaleString('fr-FR')
                    : '—'
                }
              />
              <div className="mt-4">
                <Button
                  variant="secondary"
                  icon={<LogOut className="h-4 w-4" />}
                  onClick={() => signOut().then(() => go('/'))}
                >
                  {t('settings.signOutAll')}
                </Button>
              </div>
            </Card>
          )}

          {section === 'privacy' && (
            <div className="space-y-4">
              <Card title="Confidentialité et données">
                <p className="text-sm leading-relaxed text-slate-600">
                  Vous gardez la main sur vos données. Chaque contrôle ci-dessous correspond à une
                  fonction réelle de l'application.
                </p>
              </Card>

              <Card title="Géolocalisation">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-hec-50 text-hec-600" aria-hidden="true">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 text-sm leading-relaxed text-slate-600">
                    <p>
                      Votre position est utilisée pour vous localiser sur le campus et vous guider vers une
                      destination. Elle est traitée dans votre navigateur et n'est pas enregistrée par
                      l'application.
                    </p>
                    <p className="mt-2 font-semibold text-hec-950" role="status">
                      Autorisation du navigateur :{' '}
                      {geoPerm === 'granted' && 'accordée'}
                      {geoPerm === 'prompt' && 'pas encore demandée'}
                      {geoPerm === 'denied' && 'refusée — la carte reste utilisable, choisissez votre départ manuellement'}
                      {geoPerm === 'unknown' && 'état indisponible sur ce navigateur'}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Pour accorder ou retirer l'accès, utilisez les réglages du site dans votre navigateur
                      (cadenas de la barre d'adresse) : une application web ne peut pas le modifier à votre place.
                    </p>
                  </div>
                </div>
              </Card>

              <Card title="Cookies et stockage">
                <p className="text-sm leading-relaxed text-slate-600">
                  L'application n'écrit aucun cookie et n'utilise aucun outil de mesure d'audience ni de
                  publicité : il n'y a donc pas de préférence de cookies à régler. Le stockage local
                  utilisé (préférences, session) est détaillé sur la page cookies.
                </p>
              </Card>

              <Card title="Historique de recherche">
                <Toggle
                  label="Enregistrer mes recherches dans mon compte"
                  checked={saveHistory}
                  onChange={toggleSaveHistory}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Désactivé : vos nouvelles recherches ne sont plus enregistrées (cette préférence est
                  gardée sur cet appareil). Les recherches déjà enregistrées ne sont pas effacées
                  automatiquement.
                </p>
                <div className="mt-4">
                  <Button variant="secondary" icon={<Trash2 className="h-4 w-4" />} onClick={handleClearHistory}>
                    {t('settings.clearHistory')}
                  </Button>
                  {cleared && (
                    <p role="status" className="mt-2 text-sm text-emerald-600">
                      Historique supprimé.
                    </p>
                  )}
                </div>
              </Card>

              <Card title="Mes données">
                <p className="text-sm leading-relaxed text-slate-600">
                  Consultez ce que l'application a enregistré pour votre compte, ou téléchargez-le (fichier
                  JSON généré sur votre appareil).
                </p>
                <Row label="Nom" value={profile?.full_name ?? '—'} />
                <Row label="Adresse e-mail" value={session?.user?.email ?? '—'} />
                <Row label="Profil" value={profile?.role ?? '—'} />
                {myData && (
                  <>
                    {(() => {
                      const sum = summarize(myData);
                      return (
                        <>
                          <Row label="Favoris" value={String(sum.favorites)} />
                          <Row label="Recherches enregistrées" value={String(sum.searches)} />
                          <Row label="Réservations" value={String(sum.bookings)} />
                          <Row label="Signalements" value={String(sum.reports)} />
                          <Row label="Notifications" value={String(sum.notifications)} />
                        </>
                      );
                    })()}
                  </>
                )}
                {myDataError && (
                  <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600">
                    {myDataError}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={loadMyData} loading={myDataLoading}>
                    {myData ? 'Actualiser' : 'Afficher le récapitulatif'}
                  </Button>
                  <Button
                    icon={<FileDown className="h-4 w-4" />}
                    disabled={!myData}
                    onClick={() => myData && downloadMyData(myData)}
                  >
                    Télécharger mes données
                  </Button>
                </div>
                {!myData && (
                  <p className="mt-2 text-xs text-slate-500">
                    Affichez d'abord le récapitulatif pour activer le téléchargement.
                  </p>
                )}
              </Card>

              <Card title="Supprimer mon compte">
                <p className="text-sm leading-relaxed text-slate-600">
                  L'application ne propose pas encore de suppression de compte automatique. Pour supprimer
                  votre compte, adressez une demande à l'administration en indiquant l'adresse e-mail du
                  compte : la suppression du compte supprime aussi les données qui lui sont rattachées
                  (profil, favoris, historique, paramètres, notifications, réservations, signalements).
                </p>
                <div className="mt-3">
                  <ContactBlock />
                </div>
              </Card>

              <Card title="Documents">
                <ul className="space-y-1">
                  {LEGAL_LINKS.map((l) => (
                    <li key={l.path}>
                      <button
                        type="button"
                        onClick={() => go(l.path)}
                        className="flex min-h-[44px] w-full items-center justify-between rounded-lg px-1 text-left text-sm font-medium text-hec-950 hover:text-hec-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
                      >
                        {l.label}
                        <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {section === 'data' && (
            <Card title={t('settings.data')}>
              <p className="text-sm text-slate-600">
                Vos données (favoris, historique de recherche, réservations et signalements) sont rattachées à votre compte et protégées par des règles d'accès propres à chaque utilisateur. Le détail et les contrôles sont dans « Confidentialité et données ».
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  variant="secondary"
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={handleClearHistory}
                >
                  {t('settings.clearHistory')}
                </Button>
                {cleared && (
                  <p className="text-sm text-emerald-600">Historique supprimé.</p>
                )}
              </div>
            </Card>
          )}

          {section === 'about' && (
            <Card title={t('settings.about')}>
              <p className="text-sm text-slate-600">
                HEC Localisation — "Le campus HEC, à portée de carte."
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Version 1.0 · Données de démonstration · © {new Date().getFullYear()} HEC Kinshasa
              </p>
              {pwaInstallAvailable && (
                <div className="mt-4">
                  <Button
                    variant="secondary"
                    icon={<Download className="h-4 w-4" />}
                    onClick={handleInstallClick}
                    loading={pwaInstalling}
                  >
                    Installer l'application
                  </Button>
                </div>
              )}
              {showIosInstallHelp && (
                <p className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
                  Sur iPhone/iPad : appuyez sur <strong>Partager</strong> (icône carrée avec une
                  flèche vers le haut) dans Safari, puis sur{' '}
                  <strong>« Sur l'écran d'accueil »</strong>.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5">
      <h2 className="mb-4 font-display text-lg font-bold text-hec-950">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-50 py-3 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-hec-950">{value}</span>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[44px] w-full items-center justify-between border-b border-slate-50 py-3 last:border-0"
    >
      <span className="text-sm font-medium text-hec-950">{label}</span>
      <span
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-hec-500' : 'bg-slate-200'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
