import { useEffect, useState } from 'react';
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Compass,
  Heart,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  Moon,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  User,
  QrCode,
  GraduationCap,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCampus } from '@/context/CampusContext';
import { useSettings } from '@/context/SettingsContext';
import { useNavigate, useRoute } from '@/lib/router';
import { isAdminRole, isSuperAdmin } from '@/lib/roles';
import { getNotifications } from '@/lib/extension-api';
import { Logo } from '@/components/ui';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { OnboardingModal } from '@/components/OnboardingModal';

// Navigation principale : toujours visible, quel que soit le rôle.
const primaryNavItems = [
  { path: '/', labelKey: 'nav.home', icon: Home },
  { path: '/map', labelKey: 'nav.map', icon: MapIcon },
  { path: '/search', labelKey: 'nav.search', icon: Search },
  { path: '/tour', labelKey: 'nav.tour', icon: Compass },
];

// "Mon espace" : fonctionnalités liées au compte connecté.
const mySpaceItems = [
  { path: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { path: '/assistant', labelKey: 'nav.assistant', icon: Sparkles },
  { path: '/notifications', labelKey: 'nav.notifications', icon: Bell },
  { path: '/favorites', labelKey: 'nav.favorites', icon: Heart },
  { path: '/events', labelKey: 'nav.events', icon: CalendarDays },
  { path: '/schedule', labelKey: 'nav.schedule', icon: GraduationCap },
  { path: '/bookings', labelKey: 'nav.bookings', icon: CalendarDays },
  { path: '/reports', labelKey: 'nav.reports', icon: ShieldAlert },
  { path: '/qr', labelKey: 'nav.qr', icon: QrCode },
  { path: '/profile', labelKey: 'nav.profile', icon: User },
  { path: '/settings', labelKey: 'nav.settings', icon: Settings },
];

const adminItems = [
  { path: '/admin', labelKey: 'nav.admin', icon: ShieldAlert },
];

// Bottom nav mobile : les 4 actions les plus fréquentes + "Plus".
const mobileNav = [
  { path: '/', labelKey: 'nav.home', icon: Home },
  { path: '/map', labelKey: 'nav.map', icon: MapIcon },
  { path: '/search', labelKey: 'nav.search', icon: Search },
  { path: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
];

const moreNavItems = [
  { path: '/assistant', labelKey: 'nav.assistant', icon: Sparkles },
  { path: '/tour', labelKey: 'nav.tour', icon: Compass },
  { path: '/notifications', labelKey: 'nav.notifications', icon: Bell },
  { path: '/schedule', labelKey: 'nav.schedule', icon: GraduationCap },
  { path: '/events', labelKey: 'nav.events', icon: CalendarDays },
  { path: '/favorites', labelKey: 'nav.favorites', icon: Heart },
  { path: '/bookings', labelKey: 'nav.bookings', icon: CalendarDays },
  { path: '/reports', labelKey: 'nav.reports', icon: ShieldAlert },
  { path: '/qr', labelKey: 'nav.qr', icon: QrCode },
  { path: '/help', labelKey: 'nav.help', icon: HelpCircle },
  { path: '/profile', labelKey: 'nav.profile', icon: User },
  { path: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { session, profile, signOut } = useAuth();
  const { campus } = useCampus();
  const { settings, setTheme, t } = useSettings();
  const route = useRoute();
  const go = useNavigate();
  const [online, setOnline] = useState(navigator.onLine);
  const [moreOpen, setMoreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // PHASE 13 : onboarding affiché une seule fois par utilisateur — stocké
  // en local (aucune colonne dédiée côté Supabase, donc rien à casser).
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!session) {
      setShowOnboarding(false);
      return;
    }
    const key = `hec_onboarding_seen_${session.user.id}`;
    if (!localStorage.getItem(key)) setShowOnboarding(true);
  }, [session]);

  const dismissOnboarding = () => {
    if (session) {
      localStorage.setItem(`hec_onboarding_seen_${session.user.id}`, '1');
    }
    setShowOnboarding(false);
  };

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    setMoreOpen(false);
    setUserMenuOpen(false);
  }, [route.path]);

  // PHASE 15 : recherche globale accessible depuis n'importe quelle page
  // via Ctrl+K / Cmd+K, sans intercepter les raccourcis natifs des champs
  // de saisie (on laisse passer si un input/textarea a le focus, sauf
  // pour Ctrl/Cmd+K qui doit rester global).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        go('/search');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go]);

  // Compteur de notifications non lues, affiché en badge sur la cloche.
  useEffect(() => {
    if (!session) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    getNotifications(session.user.id)
      .then((items) => {
        if (!cancelled) setUnreadCount(items.filter((n) => !n.is_read).length);
      })
      .catch(() => {
        /* silencieux : le badge reste à 0 si la requête échoue */
      });
    return () => {
      cancelled = true;
    };
  }, [session, route.path]);

  const isActive = (path: string) => {
    if (path === '/') return route.path === '/' || route.path === '/dashboard';
    return route.path.startsWith(path);
  };

  // Conserver cette logique : le menu admin dépend uniquement du rôle
  // réellement chargé dans `profile` (contrôlé côté backend, cf. Phase 18).
  const isAdmin = isAdminRole(profile?.role);
  const isSuper = isSuperAdmin(profile?.role);

  const allMoreItems = isAdmin ? [...moreNavItems, ...adminItems] : moreNavItems;
  const isMoreActive = allMoreItems.some((item) => isActive(item.path));

  const adminLabel = (path: string, translated: string) =>
    path === '/admin' ? `${isSuper ? '🛡️' : '⚙️'} ${translated}` : translated;

  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-hec-950">
      {showOnboarding && <OnboardingModal onDone={dismissOnboarding} />}
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-100 bg-white dark:border-hec-900 dark:bg-hec-900 md:flex">
        <div className="px-5 py-5">
          <button onClick={() => go('/')} aria-label={t('nav.backToHome')}>
            <Logo />
          </button>
        </div>
        <div className="px-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-hec-800">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Campus
            </p>
            <p className="mt-0.5 truncate text-sm font-bold text-hec-950 dark:text-white">
              {campus?.name ?? 'HEC Kinshasa'}
            </p>
          </div>
        </div>
        <nav className="no-scrollbar mt-4 flex-1 space-y-1 overflow-y-auto px-3">
          {primaryNavItems.map((item) => (
            <button
              key={item.path}
              onClick={() => go(item.path)}
              className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive(item.path)
                  ? 'bg-hec-950 text-white dark:bg-hec-700'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-hec-800'
              }`}
            >
              {isActive(item.path) && (
                <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-hec-400" aria-hidden="true" />
              )}
              <item.icon className="h-4 w-4" />
              {t(item.labelKey)}
            </button>
          ))}

          <p className="mb-1 mt-5 px-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {t('nav.mySpace')}
          </p>
          {mySpaceItems.map((item) => (
            <button
              key={item.path}
              onClick={() => go(item.path)}
              className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive(item.path)
                  ? 'bg-hec-950 text-white dark:bg-hec-700'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-hec-800'
              }`}
            >
              {isActive(item.path) && (
                <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-hec-400" aria-hidden="true" />
              )}
              <item.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{t(item.labelKey)}</span>
              {item.path === '/notifications' && unreadCount > 0 && (
                <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          ))}

          {isAdmin && (
            <>
              <p className="mb-1 mt-5 px-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {t('nav.administration')}
              </p>
              {adminItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => go(item.path)}
                  className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? 'bg-hec-950 text-white dark:bg-hec-700'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-hec-800'
                  }`}
                >
                  {isActive(item.path) && (
                    <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-hec-400" aria-hidden="true" />
                  )}
                  <item.icon className="h-4 w-4" />
                  {adminLabel(item.path, t(item.labelKey))}
                </button>
              ))}
            </>
          )}
        </nav>
        <div className="border-t border-slate-100 p-3 dark:border-hec-800">
          <div className="mb-2 px-1">
            <LanguageSwitcher />
          </div>
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-hec-950 text-sm font-bold text-white dark:bg-hec-700">
              {(profile?.full_name || 'V')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-hec-950 dark:text-white">
                {profile?.full_name || 'Visiteur'}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {profile?.role ?? 'VISITOR'}
              </p>
            </div>
            <button
              onClick={() => signOut().then(() => go('/'))}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-hec-800"
              aria-label="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {!online && (
          <div className="bg-amber-50 px-4 py-1.5 text-center text-xs font-semibold text-amber-700">
            {t('common.offline')}
          </div>
        )}

        {/* Header global : recherche rapide, notifications, langue, thème, menu utilisateur */}
        <header className="hidden shrink-0 items-center gap-4 border-b border-slate-100 bg-white px-6 py-3 dark:border-hec-900 dark:bg-hec-900 md:flex">
          <button
            onClick={() => go('/search')}
            className="flex max-w-md flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-left text-sm text-slate-400 hover:border-hec-300 hover:bg-white dark:border-hec-800 dark:bg-hec-800 dark:hover:bg-hec-800/70"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{t('header.searchPlaceholder')}</span>
            <kbd className="hidden shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-400 dark:border-hec-700 dark:bg-hec-900 sm:inline">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => go('/notifications')}
              className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-hec-800"
              aria-label={t('nav.notifications')}
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
              )}
            </button>

            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-hec-800"
              aria-label="Thème"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <LanguageSwitcher compact menuPosition="down" />

            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-hec-800"
                aria-label={t('header.userMenu')}
                aria-expanded={userMenuOpen}
              >
                <div className="grid h-8 w-8 place-items-center rounded-full bg-hec-950 text-xs font-bold text-white dark:bg-hec-700">
                  {(profile?.full_name || 'V')[0].toUpperCase()}
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-slate-100 bg-white p-1.5 shadow-panel dark:border-hec-800 dark:bg-hec-900">
                    <div className="px-2.5 py-2">
                      <p className="truncate text-sm font-semibold text-hec-950 dark:text-white">
                        {profile?.full_name || 'Visiteur'}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {profile?.role ?? 'VISITOR'}
                      </p>
                    </div>
                    <div className="my-1 border-t border-slate-100 dark:border-hec-800" />
                    <button
                      onClick={() => go('/profile')}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-hec-800"
                    >
                      <User className="h-4 w-4" /> {t('nav.profile')}
                    </button>
                    <button
                      onClick={() => go('/settings')}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-hec-800"
                    >
                      <Settings className="h-4 w-4" /> {t('nav.settings')}
                    </button>
                    <button
                      onClick={() => go('/help')}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-hec-800"
                    >
                      <HelpCircle className="h-4 w-4" /> {t('nav.help')}
                    </button>
                    <button
                      onClick={() => go('/')}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-hec-800"
                    >
                      <Home className="h-4 w-4" /> {t('nav.backToHome')}
                    </button>
                    <div className="my-1 border-t border-slate-100 dark:border-hec-800" />
                    <button
                      onClick={() => signOut().then(() => go('/'))}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-hec-800"
                    >
                      <LogOut className="h-4 w-4" /> Déconnexion
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>
      </div>

      {/* Mobile "Plus" sheet: full menu with every section */}
      {moreOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end md:hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="relative max-h-[80vh] overflow-y-auto rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-panel dark:bg-hec-900">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-hec-800 dark:bg-hec-900">
              <span className="font-display text-base font-bold text-hec-950 dark:text-white">
                Menu
              </span>
              <button
                onClick={() => setMoreOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-hec-800"
                aria-label="Fermer le menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 px-5 py-5">
              {allMoreItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => go(item.path)}
                  className={`relative flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center text-xs font-semibold transition-colors ${
                    isActive(item.path)
                      ? 'bg-hec-950 text-white dark:bg-hec-700'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-hec-800 dark:text-slate-300'
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {adminLabel(item.path, t(item.labelKey))}
                  {item.path === '/notifications' && unreadCount > 0 && (
                    <span className="absolute right-3 top-3 grid h-4 min-w-[1rem] place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 px-5 py-4 dark:border-hec-800">
              <div className="mb-3 flex items-center gap-2">
                <LanguageSwitcher menuPosition="up" />
                <button
                  onClick={() => setTheme(isDark ? 'light' : 'dark')}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 dark:border-hec-800 dark:text-slate-300"
                  aria-label="Thème"
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </div>
              <button
                onClick={() => go('/')}
                className="mb-3 flex w-full items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-600 dark:bg-hec-800 dark:text-slate-300"
              >
                <Home className="h-4 w-4" /> {t('nav.backToHome')}
              </button>
              <div className="flex items-center gap-3 rounded-xl px-1 py-1">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-hec-950 text-sm font-bold text-white dark:bg-hec-700">
                  {(profile?.full_name || 'V')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-hec-950 dark:text-white">
                    {profile?.full_name || 'Visiteur'}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {profile?.role ?? 'VISITOR'}
                  </p>
                </div>
                <button
                  onClick={() => signOut().then(() => go('/'))}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-hec-800"
                  aria-label="Déconnexion"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-slate-100 bg-white/95 px-2 py-1.5 backdrop-blur dark:border-hec-800 dark:bg-hec-900/95 md:hidden">
        {mobileNav.map((item) => (
          <button
            key={item.path}
            onClick={() => go(item.path)}
            aria-current={isActive(item.path) ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors ${
              isActive(item.path)
                ? 'text-hec-600 dark:text-hec-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {isActive(item.path) && (
              <span className="absolute -top-1.5 h-1 w-1 rounded-full bg-hec-500" aria-hidden="true" />
            )}
            <item.icon className="h-5 w-5" />
            {t(item.labelKey)}
          </button>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className={`relative flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors ${
            isMoreActive ? 'text-hec-600 dark:text-hec-400' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <Menu className="h-5 w-5" />
          Plus
          {unreadCount > 0 && (
            <span className="absolute right-1 top-0 h-2 w-2 rounded-full bg-red-500" />
          )}
        </button>
      </nav>
    </div>
  );
}
