import { useEffect, useState } from 'react';
import {
  Building2,
  CalendarDays,
  CheckCircle,
  Image as ImageIcon,
  MapPin,
  Map as MapIcon,
  Megaphone,
  Plus,
  QrCode,
  Settings2,
  ShieldAlert,
  Stethoscope,
  Users,
  Search as SearchIcon,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { useCampus } from '@/context/CampusContext';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { EmptyState } from '@/components/ui';
import { AdminCampusManager } from '@/components/AdminCampusManager';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AdminUsersManager } from '@/components/AdminUsersManager';
import { AdminQRManager } from '@/components/AdminQRManager';
import { AdminDiagnosticPanel } from '@/components/AdminDiagnosticPanel';
import { isAdminRole, isFullAdminRole } from '@/lib/roles';
import type { RouteSegment } from '@/lib/types';

interface Stats {
  totalUsers: number;
  totalBuildings: number;
  totalRooms: number;
  totalBookings: number;
  totalReports: number;
  totalEvents: number;
  totalSearches: number;
}

type ActivityKind = 'location' | 'building' | 'image' | 'user' | 'announcement';

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  label: string;
  created_at: string;
}

export function AdminPage() {
  const { locations, events, routeSegments, campus } = useCampus();
  const { t } = useSettings();
  const { profile } = useAuth();
  const go = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [popularSearches, setPopularSearches] = useState<{ query: string; count: number }[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [section, setSection] = useState<
    'overview' | 'manage' | 'qr' | 'users' | 'diagnostic'
  >('overview');

  // ÉTAPE 8 : conserver la logique de garde (elle est correcte) — on la
  // centralise simplement via lib/roles pour éviter toute divergence avec
  // AppShell et le garde de route dans App.tsx.
  const isAdmin = isAdminRole(profile?.role);
  // ÉTAPE 6 : la gestion des utilisateurs est réservée à ADMIN/SUPER_ADMIN,
  // pas à CAMPUS_MANAGER.
  const canManageUsers = isFullAdminRole(profile?.role);

  // Si le rôle est rafraîchi en cours de session (ex: rétrogradé depuis
  // Supabase) et que la section active n'est plus accessible, on retombe
  // sur la vue d'ensemble plutôt que de laisser un onglet orphelin.
  useEffect(() => {
    if (section === 'users' && !canManageUsers) setSection('overview');
  }, [section, canManageUsers]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [users, buildings, rooms, bookings, reports, searches] =
        await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('buildings').select('id', { count: 'exact', head: true }),
          supabase.from('locations').select('id', { count: 'exact', head: true }).eq('kind', 'room'),
          supabase.from('bookings').select('id', { count: 'exact', head: true }),
          supabase.from('reports').select('id', { count: 'exact', head: true }),
          supabase.from('search_history').select('query'),
        ]);
      setStats({
        totalUsers: users.count ?? 0,
        totalBuildings: buildings.count ?? 0,
        totalRooms: rooms.count ?? 0,
        totalBookings: bookings.count ?? 0,
        totalReports: reports.count ?? 0,
        totalEvents: events.length,
        totalSearches: searches.count ?? 0,
      });
      // Popular searches
      const counts = new Map<string, number>();
      for (const row of searches.data ?? []) {
        const q = (row as { query: string }).query.toLowerCase();
        counts.set(q, (counts.get(q) ?? 0) + 1);
      }
      setPopularSearches(
        [...counts.entries()]
          .map(([query, count]) => ({ query, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
      );
    })();
  }, [isAdmin, events.length]);

  // ACTIVITÉ RÉCENTE (PHASE 6) : cinq flux réels fusionnés et triés par
  // date — jamais de contenu inventé. Chaque entrée mène à une action
  // effectivement traçable côté backend.
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [locs, blds, imgs, users, ann] = await Promise.all([
        supabase.from('locations').select('id, name, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('buildings').select('id, name, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('building_images').select('id, caption, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('profiles').select('id, full_name, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('announcements').select('id, title, created_at').order('created_at', { ascending: false }).limit(5),
      ]);
      const items: ActivityItem[] = [
        ...(locs.data ?? []).map((r) => ({
          id: `loc-${r.id}`,
          kind: 'location' as const,
          label: `Nouvelle localisation ajoutée : ${r.name}`,
          created_at: r.created_at,
        })),
        ...(blds.data ?? []).map((r) => ({
          id: `bld-${r.id}`,
          kind: 'building' as const,
          label: `Nouveau bâtiment publié : ${r.name}`,
          created_at: r.created_at,
        })),
        ...(imgs.data ?? []).map((r) => ({
          id: `img-${r.id}`,
          kind: 'image' as const,
          label: `Nouvelle image téléchargée${r.caption ? ` : ${r.caption}` : ''}`,
          created_at: r.created_at,
        })),
        ...(users.data ?? []).map((r) => ({
          id: `usr-${r.id}`,
          kind: 'user' as const,
          label: `Utilisateur créé : ${r.full_name ?? 'Sans nom'}`,
          created_at: r.created_at,
        })),
        ...(ann.data ?? []).map((r) => ({
          id: `ann-${r.id}`,
          kind: 'announcement' as const,
          label: `Annonce publiée : ${r.title}`,
          created_at: r.created_at,
        })),
      ]
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
        .slice(0, 6);
      setActivity(items);
    })();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-10">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title={t('admin.noAccess')}
          description=""
        />
      </div>
    );
  }

  const sectionSwitcher = (
    <div className="mt-6 inline-flex rounded-xl border border-slate-200 bg-white p-1">
      <button
        onClick={() => setSection('overview')}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
          section === 'overview' ? 'bg-hec-950 text-white' : 'text-slate-500 hover:text-hec-700'
        }`}
      >
        <TrendingUp className="h-4 w-4" />
        Vue d'ensemble
      </button>
      <button
        onClick={() => setSection('manage')}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
          section === 'manage' ? 'bg-hec-950 text-white' : 'text-slate-500 hover:text-hec-700'
        }`}
      >
        <Settings2 className="h-4 w-4" />
        Gérer le campus
      </button>
      <button
        onClick={() => setSection('qr')}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
          section === 'qr' ? 'bg-hec-950 text-white' : 'text-slate-500 hover:text-hec-700'
        }`}
      >
        <QrCode className="h-4 w-4" />
        QR Codes
      </button>
      {canManageUsers && (
        <button
          onClick={() => setSection('users')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
            section === 'users' ? 'bg-hec-950 text-white' : 'text-slate-500 hover:text-hec-700'
          }`}
        >
          <Users className="h-4 w-4" />
          Utilisateurs
        </button>
      )}
      <button
        onClick={() => setSection('diagnostic')}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
          section === 'diagnostic' ? 'bg-hec-950 text-white' : 'text-slate-500 hover:text-hec-700'
        }`}
      >
        <Stethoscope className="h-4 w-4" />
        Diagnostic
      </button>
    </div>
  );

  // Titre + sous-titre : "Vue d'ensemble" a son propre en-tête dynamique
  // (salutation), les quatre autres sections partagent le même h1 et ne
  // changent que de sous-titre.
  const sectionSubtitle: Record<Exclude<typeof section, 'overview'>, string> = {
    manage: "Ajoutez, modifiez ou supprimez des bâtiments et des salles.",
    qr: "Créez les QR codes associés aux lieux du campus ; téléchargement, impression et activation restent sur la page QR Codes publique.",
    users:
      "Consultez les comptes et leurs rôles. Le changement de rôle se fait depuis Supabase (voir ÉTAPE 9) et se reflète ici après rafraîchissement.",
    diagnostic:
      "Zone de diagnostic temporaire (ÉTAPE 11) — utile pour vérifier exactement ce que l'application reçoit de Supabase.",
  };

  const firstName = (profile?.full_name || 'Administrateur').split(' ')[0];

  // IMPORTANT : les quatre panneaux ci-dessous restent tous montés en
  // permanence une fois l'admin authentifié (au lieu d'un `return` distinct
  // par section comme avant) — seul l'affichage bascule via `hidden`.
  // AdminCampusManager / AdminQRManager / AdminUsersManager /
  // AdminDiagnosticPanel font chacun leur propre fetch + spinner "Chargement…"
  // à leur montage ; les démonter/remonter à chaque clic d'onglet relançait
  // ce spinner à chaque fois, même en revenant sur un onglet déjà chargé
  // deux secondes plus tôt. Les garder montés fait ce fetch une seule fois
  // par session admin.
  return (
    <div className="mx-auto max-w-5xl px-5 py-6 lg:px-8 lg:py-10">
      <h1 className="font-display text-2xl font-bold text-hec-950">
        {section === 'overview' ? `Bonjour, ${firstName}.` : t('admin.title')}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {section === 'overview' ? "Vue d'ensemble du campus." : sectionSubtitle[section]}
      </p>
      {sectionSwitcher}
      {isFullAdminRole(profile?.role) && (
        <button
          type="button"
          onClick={() => go('/admin/compliance')}
          className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-sm font-semibold text-hec-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
        >
          Conformité et confiance →
        </button>
      )}

      <div className={section === 'overview' ? '' : 'hidden'}>
        <AdminOverview
          stats={stats}
          popularSearches={popularSearches}
          activity={activity}
          locations={locations}
          routeSegments={routeSegments}
          go={go}
          t={t}
          onNavigateToManage={() => setSection('manage')}
        />
      </div>

      <div className={section === 'manage' ? '' : 'hidden'}>
        {campus ? (
          <ErrorBoundary
            title="La gestion du campus rencontre un problème."
            description="Le reste de l'administration continue de fonctionner — vous pouvez réessayer."
          >
            <AdminCampusManager campus={campus} />
          </ErrorBoundary>
        ) : (
          <p className="mt-6 text-sm text-slate-500">{t('common.loading')}</p>
        )}
      </div>

      <div className={section === 'qr' ? '' : 'hidden'}>
        <ErrorBoundary
          title="La gestion des QR codes rencontre un problème."
          description="Le reste de l'administration continue de fonctionner — vous pouvez réessayer."
        >
          <AdminQRManager />
        </ErrorBoundary>
      </div>

      {canManageUsers && (
        <div className={section === 'users' ? '' : 'hidden'}>
          <AdminUsersManager />
        </div>
      )}

      <div className={section === 'diagnostic' ? '' : 'hidden'}>
        <AdminDiagnosticPanel />
      </div>
    </div>
  );
}

/**
 * Contenu de l'onglet "Vue d'ensemble" — extrait de AdminPage en composant
 * local pour que ce dernier reste un simple `return` unique (voir plus haut :
 * tous les panneaux restent montés, seul `hidden` bascule). N'affecte pas le
 * bug de rechargement : `stats`/`activity`/`popularSearches` sont déjà
 * chargés au niveau de AdminPage indépendamment de la section active, donc
 * ce composant peut sans problème être démonté/remonté (CSS `hidden` mis à
 * part, React ne le fait plus ici de toute façon).
 */
function AdminOverview({
  stats,
  popularSearches,
  activity,
  locations,
  routeSegments,
  go,
  t,
  onNavigateToManage,
}: {
  stats: Stats | null;
  popularSearches: { query: string; count: number }[];
  activity: ActivityItem[];
  locations: ReturnType<typeof useCampus>['locations'];
  routeSegments: RouteSegment[];
  go: ReturnType<typeof useNavigate>;
  t: ReturnType<typeof useSettings>['t'];
  onNavigateToManage: () => void;
}) {
  if (!stats) {
    return <p className="mt-6 text-sm text-slate-500">{t('common.loading')}</p>;
  }

  const kpis = [
    { label: t('admin.totalUsers'), value: stats.totalUsers, icon: Users },
    { label: t('admin.totalBuildings'), value: stats.totalBuildings, icon: Building2 },
    { label: t('admin.totalRooms'), value: stats.totalRooms, icon: MapPin },
    { label: t('admin.totalBookings'), value: stats.totalBookings, icon: CalendarDays },
    { label: t('admin.totalReports'), value: stats.totalReports, icon: ShieldAlert },
    { label: t('admin.totalEvents'), value: stats.totalEvents, icon: CalendarDays },
    { label: t('admin.totalSearches'), value: stats.totalSearches, icon: SearchIcon },
  ];

  const activityIcons: Record<ActivityKind, typeof MapPin> = {
    location: MapPin,
    building: Building2,
    image: ImageIcon,
    user: UserPlus,
    announcement: Megaphone,
  };

  const adminShortcuts = [
    { label: 'Ajouter bâtiment', icon: Building2, onClick: onNavigateToManage },
    { label: 'Ajouter lieu', icon: Plus, onClick: onNavigateToManage },
    { label: 'Ajouter salle', icon: MapPin, onClick: onNavigateToManage },
    { label: 'Ajouter bureau', icon: Users, onClick: onNavigateToManage },
    { label: 'Ajouter média', icon: ImageIcon, onClick: onNavigateToManage },
  ];

  const poiCount = locations.filter((l) => l.kind === 'poi').length;
  const maxSearch = Math.max(1, ...popularSearches.map((s) => s.count));

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-2xl border border-slate-100 bg-white p-4"
          >
            <div className="flex items-center gap-2 text-slate-400">
              <k.icon className="h-4 w-4" />
              <span className="text-[11px] font-medium uppercase tracking-wide">
                {k.label}
              </span>
            </div>
            <p className="mt-2 font-display text-2xl font-extrabold text-hec-950">
              {k.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Activité récente */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-hec-500" />
            <h2 className="font-display text-lg font-bold text-hec-950">
              {t('admin.recentActivity')}
            </h2>
          </div>
          {activity.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{t('common.noResults')}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {activity.map((item) => {
                const Icon = activityIcons[item.kind];
                return (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-hec-50 text-hec-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-hec-950">
                        {item.label}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">
                      {new Date(item.created_at).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Raccourcis admin */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-hec-500" />
            <h2 className="font-display text-lg font-bold text-hec-950">
              {t('admin.shortcuts')}
            </h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {adminShortcuts.map((s) => (
              <button
                key={s.label}
                onClick={s.onClick}
                className="group flex items-center gap-2.5 rounded-xl border border-slate-100 px-3 py-2.5 text-left transition-all hover:border-hec-200 hover:bg-hec-50"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-hec-50 text-hec-600 transition-colors group-hover:bg-hec-500 group-hover:text-white">
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="truncate text-sm font-semibold text-hec-950">
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Carte admin */}
      <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapIcon className="h-4 w-4 text-hec-500" />
            <h2 className="font-display text-lg font-bold text-hec-950">
              {t('admin.adminMap')}
            </h2>
          </div>
          <button
            onClick={() => go('/map')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-hec-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-hec-900"
          >
            Ouvrir la carte
          </button>
        </div>
        <button
          onClick={() => go('/map')}
          className="mt-4 grid w-full grid-cols-4 gap-3 rounded-xl bg-slate-50 p-4 text-center transition-colors hover:bg-hec-50"
        >
          <div>
            <p className="font-display text-xl font-extrabold text-hec-950">
              {stats.totalBuildings}
            </p>
            <p className="text-[11px] text-slate-500">Bâtiments</p>
          </div>
          <div>
            <p className="font-display text-xl font-extrabold text-hec-950">
              {locations.length}
            </p>
            <p className="text-[11px] text-slate-500">Lieux</p>
          </div>
          <div>
            <p className="font-display text-xl font-extrabold text-hec-950">
              {poiCount}
            </p>
            <p className="text-[11px] text-slate-500">Points d'intérêt</p>
          </div>
          <div>
            <p className="font-display text-xl font-extrabold text-hec-950">
              {routeSegments.length}
            </p>
            <p className="text-[11px] text-slate-500">Itinéraires</p>
          </div>
        </button>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Popular searches */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-hec-500" />
            <h2 className="font-display text-lg font-bold text-hec-950">
              {t('admin.popularDestinations')}
            </h2>
          </div>
          {popularSearches.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{t('common.noResults')}</p>
          ) : (
            <div className="mt-4 space-y-2">
              {popularSearches.map((s) => (
                <div key={s.query} className="flex items-center gap-3">
                  <span className="w-32 truncate text-sm font-medium text-hec-950">
                    {s.query}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-hec-500 transition-all"
                      style={{ width: `${(s.count / maxSearch) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-400">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Building usage */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-hec-500" />
            <h2 className="font-display text-lg font-bold text-hec-950">
              {t('admin.buildingUsage')}
            </h2>
          </div>
          <div className="mt-4 space-y-2">
            {locations
              .filter((l) => l.building)
              .reduce(
                (acc, l) => {
                  const b = l.building!;
                  const existing = acc.find((x) => x.name === b.name);
                  if (existing) existing.count++;
                  else acc.push({ name: b.name, color: b.color, count: 1 });
                  return acc;
                },
                [] as { name: string; color: string; count: number }[],
              )
              .sort((a, b) => b.count - a.count)
              .slice(0, 6)
              .map((b) => {
                const max = Math.max(1, locations.length);
                return (
                  <div key={b.name} className="flex items-center gap-3">
                    <span className="w-32 truncate text-sm font-medium text-hec-950">
                      {b.name.split('—')[0].trim()}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(b.count / max) * 100}%`,
                          background: b.color,
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-400">
                      {b.count}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-700">
        <CheckCircle className="h-5 w-5" />
        {stats.totalBookings} réservation(s) · {stats.totalReports} signalement(s) ·{' '}
        {stats.totalSearches} recherche(s)
      </div>
    </div>
  );
}
