import { Suspense, useEffect } from 'react';
import { useNavigate, useRoute } from '@/lib/router';
import { useAuth } from '@/context/AuthContext';
import { isAdminRole, isFullAdminRole, homeRouteForRole } from '@/lib/roles';
import { AppShell } from '@/components/AppShell';
import { LandingPage } from '@/pages/LandingPage';
import { AuthPage } from '@/pages/AuthPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { Spinner } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { lazyPage, clearChunkReloadFlag } from '@/lib/lazy';

// Pages chargées à la demande : la page d'accueil et la connexion (les
// premières vues d'un visiteur) ne téléchargent plus MapLibre, l'admin ni
// les modules QR. Voir vite.config.ts (manualChunks).
const MapPage = lazyPage(() => import('@/pages/MapPage').then((m) => ({ default: m.MapPage })));
const SearchPage = lazyPage(() => import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const DashboardPage = lazyPage(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const AssistantPage = lazyPage(() => import('@/pages/AssistantPage').then((m) => ({ default: m.AssistantPage })));
const EventsPage = lazyPage(() => import('@/pages/EventsPage').then((m) => ({ default: m.EventsPage })));
const FavoritesPage = lazyPage(() => import('@/pages/FavoritesPage').then((m) => ({ default: m.FavoritesPage })));
const ProfilePage = lazyPage(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazyPage(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const NotificationsPage = lazyPage(() => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const BookingsPage = lazyPage(() => import('@/pages/BookingsPage').then((m) => ({ default: m.BookingsPage })));
const ReportsPage = lazyPage(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SchedulePage = lazyPage(() => import('@/pages/SchedulePage').then((m) => ({ default: m.SchedulePage })));
const AdminPage = lazyPage(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const QRPage = lazyPage(() => import('@/pages/QRPage').then((m) => ({ default: m.QRPage })));
const QRScanPage = lazyPage(() => import('@/pages/QRScanPage').then((m) => ({ default: m.QRScanPage })));
const TourPage = lazyPage(() => import('@/pages/TourPage').then((m) => ({ default: m.TourPage })));
const HelpPage = lazyPage(() => import('@/pages/HelpPage').then((m) => ({ default: m.HelpPage })));
const PrivacyPage = lazyPage(() => import('@/pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazyPage(() => import('@/pages/TermsPage').then((m) => ({ default: m.TermsPage })));
const CookiesPage = lazyPage(() => import('@/pages/CookiesPage').then((m) => ({ default: m.CookiesPage })));
const BillingPage = lazyPage(() => import('@/pages/BillingPage').then((m) => ({ default: m.BillingPage })));
const AdminCompliancePage = lazyPage(() => import('@/pages/AdminCompliancePage').then((m) => ({ default: m.AdminCompliancePage })));
const AboutPage = lazyPage(() => import('@/pages/AboutPage').then((m) => ({ default: m.AboutPage })));


// Routes accessibles sans session. '/' , '/login' et '/register' sont en
// plus "réservées aux visiteurs" : un utilisateur déjà connecté qui y
// atterrit est renvoyé vers son espace (ÉTAPE 3/4).
const publicRoutes = [
  '/', '/login', '/register', '/map', '/help', '/about', '/qr-scan',
  // Pages légales : toujours accessibles sans compte.
  '/privacy', '/terms', '/cookies', '/billing',
];
const visitorOnlyRoutes = ['/', '/login', '/register'];
// Routes protégées par une session — utilisées uniquement pour distinguer
// une VRAIE route inconnue (404, PHASE 12) d'une route qui existe mais
// nécessite une connexion (qui doit continuer à rediriger vers /login).
const authRoutes = [
  '/dashboard',
  '/search',
  '/assistant',
  '/events',
  '/favorites',
  '/profile',
  '/settings',
  '/notifications',
  '/bookings',
  '/reports',
  '/schedule',
  '/admin',
  '/admin/compliance',
  '/qr',
  '/tour',
];

/**
 * Routes d'administration : /admin pour tout rôle d'administration,
 * /admin/compliance (checklist de conformité) réservée aux ADMIN et
 * SUPER_ADMIN. Renvoie true si l'utilisateur ne doit PAS y accéder.
 */
function adminRouteBlocked(path: string, role: Parameters<typeof isAdminRole>[0]): boolean {
  if (path === '/admin') return !isAdminRole(role);
  if (path === '/admin/compliance') return !isFullAdminRole(role);
  return false;
}

const routeFallback = (
  <div className="grid h-full min-h-[50vh] place-items-center">
    <Spinner label="Chargement…" />
  </div>
);

function App() {
  const { session, profile, loading, profileLoading } = useAuth();
  const route = useRoute();
  const go = useNavigate();

  useEffect(() => {
    clearChunkReloadFlag();
  }, []);

  const isPublic = publicRoutes.includes(route.path);
  const isKnownRoute = isPublic || authRoutes.includes(route.path);
  const isAuthenticated = !!session;
  // Tant que la session ou le profil ne sont pas résolus, on ne sait pas
  // encore si l'utilisateur est admin ni où le rediriger : ÉTAPE 3
  // impose d'attendre le chargement réel du profil avant toute décision.
  const authResolved = !loading && (!isAuthenticated || !profileLoading);

  useEffect(() => {
    if (!authResolved) return;

    // Une route qui n'existe pas nulle part (ni publique, ni protégée) est
    // une vraie 404 — jamais une redirection silencieuse vers la connexion
    // (PHASE 12 : le système doit toujours ramener vers une page utile).
    if (!isKnownRoute) return;

    // Un utilisateur déjà connecté qui arrive sur '/', '/login' ou
    // '/register' est envoyé vers son espace habituel selon son rôle.
    if (isAuthenticated && visitorOnlyRoutes.includes(route.path)) {
      go(homeRouteForRole(profile?.role));
      return;
    }

    // Route authentifiée (ou admin) sans session : direction connexion.
    if (!isAuthenticated && !isPublic) {
      go('/login');
      return;
    }

    // ÉTAPE 4/6 : protection centralisée de /admin, vérifiée uniquement
    // une fois le profil réellement chargé.
    if (isAuthenticated && adminRouteBlocked(route.path, profile?.role)) {
      go('/dashboard');
    }
  }, [authResolved, isAuthenticated, isPublic, isKnownRoute, route.path, profile?.role, go]);

  if (loading) {
    return (
      <div className="grid h-screen place-items-center bg-slate-50">
        <Spinner label="Chargement…" />
      </div>
    );
  }

  // Pendant que le profil (donc le rôle) se charge encore pour une session
  // déjà authentifiée, on affiche un état de chargement plutôt que de
  // risquer de montrer brièvement le mauvais tableau de bord.
  if (isAuthenticated && profileLoading) {
    return (
      <div className="grid h-screen place-items-center bg-slate-50">
        <Spinner label="Chargement du profil…" />
      </div>
    );
  }

  // Route totalement inconnue : vraie page 404, dans le même shell que le
  // reste de l'app (sidebar/header si connecté, shell public sinon), sans
  // jamais rediriger silencieusement vers la connexion ou le dashboard.
  if (!isKnownRoute) {
    return (
      <AppShell>
        <NotFoundPage />
      </AppShell>
    );
  }

  // Redirections en cours (voir l'effet ci-dessus) : ne pas afficher la
  // page d'origine le temps que la navigation se fasse.
  if (isAuthenticated && visitorOnlyRoutes.includes(route.path)) {
    return (
      <div className="grid h-screen place-items-center bg-slate-50">
        <Spinner label="Redirection…" />
      </div>
    );
  }
  if (!isAuthenticated && !isPublic) {
    return (
      <div className="grid h-screen place-items-center bg-slate-50">
        <Spinner label="Redirection…" />
      </div>
    );
  }
  if (isAuthenticated && adminRouteBlocked(route.path, profile?.role)) {
    return (
      <div className="grid h-screen place-items-center bg-slate-50">
        <Spinner label="Redirection…" />
      </div>
    );
  }

  if (route.path === '/') return <LandingPage />;
  if (route.path === '/login' || route.path === '/register') {
    return <AuthPage mode={route.path === '/register' ? 'register' : 'login'} />;
  }

  // Page publique de consultation d'un QR scanné (lecture seule, jamais
  // dans l'AppShell : destinée à un visiteur anonyme, connecté ou non).
  if (route.path === '/qr-scan') {
    return (
      <ErrorBoundary title="Une erreur est survenue.">
        <Suspense fallback={routeFallback}>
          <QRScanPage />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Map is public; other routes require session
  if (route.path === '/map') {
    return (
      <AppShell>
        <ErrorBoundary title="Une erreur est survenue.">
          <Suspense fallback={routeFallback}>
            <MapPage />
          </Suspense>
        </ErrorBoundary>
      </AppShell>
    );
  }

  let page: React.ReactNode;
  switch (route.path) {
      case '/dashboard':
        page = <DashboardPage />;
        break;
      case '/search':
        page = <SearchPage />;
        break;
      case '/assistant':
        page = <AssistantPage />;
        break;
      case '/events':
        page = <EventsPage />;
        break;
      case '/favorites':
        page = <FavoritesPage />;
        break;
      case '/profile':
        page = <ProfilePage />;
        break;
      case '/settings':
        page = <SettingsPage />;
        break;
      case '/notifications':
        page = <NotificationsPage />;
        break;
      case '/bookings':
        page = <BookingsPage />;
        break;
      case '/reports':
        page = <ReportsPage />;
        break;
      case '/schedule':
        page = <SchedulePage />;
        break;
      case '/admin':
        page = <AdminPage />;
        break;
      case '/qr':
        page = <QRPage />;
        break;
      case '/tour':
        page = <TourPage />;
        break;
      case '/help':
        page = <HelpPage />;
        break;
      case '/about':
        page = <AboutPage />;
        break;
      case '/privacy':
        page = <PrivacyPage />;
        break;
      case '/terms':
        page = <TermsPage />;
        break;
      case '/cookies':
        page = <CookiesPage />;
        break;
      case '/billing':
        page = <BillingPage />;
        break;
      case '/admin/compliance':
        page = <AdminCompliancePage />;
        break;
    default:
      page = <NotFoundPage />;
  }
  return (
    <AppShell>
      <ErrorBoundary key={route.path} title="Une erreur est survenue.">
        <Suspense fallback={routeFallback}>{page}</Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

export default App;
