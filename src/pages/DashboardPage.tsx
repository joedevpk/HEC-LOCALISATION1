import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Clock,
  Compass,
  Heart,
  Home,
  MapPin,
  QrCode,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useCampus } from '@/context/CampusContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from '@/lib/router';
import { LocationCard } from '@/components/LocationCard';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { Button, EmptyState } from '@/components/ui';
import { categoryLabels } from '@/lib/display';
import { getRecentSearches } from '@/lib/api';
import { searchLocations } from '@/lib/nav';
import { HEC_PHOTOS } from '@/lib/hec-images';

export function DashboardPage() {
  const { locations, events, announcements, favorites } = useCampus();
  const { session, profile } = useAuth();
  const go = useNavigate();
  const [tab, setTab] = useState<'home' | 'favorites' | 'events' | 'news'>('home');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [quickQuery, setQuickQuery] = useState('');

  useEffect(() => {
    if (!session) return;
    getRecentSearches(session.user.id)
      .then(setRecentSearches)
      .catch(() => undefined);
  }, [session]);

  const favoriteLocations = useMemo(
    () => locations.filter((l) => favorites.has(l.id)),
    [locations, favorites],
  );

  const upcomingEvents = useMemo(
    () =>
      [...events]
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
        .slice(0, 4),
    [events],
  );

  // Dernière destination : la recherche la plus récente, résolue vers un
  // vrai lieu si elle correspond à quelque chose sur le campus.
  const lastSearchQuery = recentSearches[0];
  const lastDestination = useMemo(() => {
    if (!lastSearchQuery) return null;
    return searchLocations(locations, lastSearchQuery)[0] ?? null;
  }, [lastSearchQuery, locations]);

  // Lieux récents : jusqu'à 4 recherches passées, résolues en lieux réels.
  const recentLocations = useMemo(() => {
    const seen = new Set<string>();
    const result = [];
    for (const q of recentSearches) {
      const match = searchLocations(locations, q)[0];
      if (match && !seen.has(match.id)) {
        seen.add(match.id);
        result.push(match);
      }
      if (result.length >= 4) break;
    }
    return result;
  }, [recentSearches, locations]);

  const firstName = (profile?.full_name || 'Visiteur').split(' ')[0];
  const initial = firstName.charAt(0).toUpperCase();

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  })();

  const submitQuickSearch = (e: FormEvent) => {
    e.preventDefault();
    go('/search', quickQuery.trim() ? { q: quickQuery.trim() } : {});
  };

  const tabs = [
    { id: 'home', label: 'Accueil', icon: Home },
    { id: 'favorites', label: 'Favoris', icon: Heart },
    { id: 'events', label: 'Événements', icon: CalendarDays },
    { id: 'news', label: 'Annonces', icon: Bell },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8 lg:py-10">
      {/* En-tête avec photo HEC discrète */}
      <div className="relative isolate overflow-hidden rounded-3xl bg-hec-950 p-5 text-white shadow-panel sm:p-7">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <img
            src={HEC_PHOTOS.entrance.small}
            srcSet={`${HEC_PHOTOS.entrance.small} 480w, ${HEC_PHOTOS.entrance.src} 810w`}
            sizes="(min-width: 1024px) 72rem, 100vw"
            alt=""
            decoding="async"
            style={{ objectPosition: 'center 65%' }}
            className="h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-hec-950 via-hec-950/85 to-hec-950/50" />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 font-display text-lg font-bold text-white backdrop-blur">
              {initial}
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-bold leading-tight !text-white sm:text-3xl">
                {greeting}, {firstName} 👋
              </h1>
              <p className="mt-0.5 text-sm text-white/75">Voici votre activité aujourd'hui.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="glass" size="sm" icon={<Search className="h-4 w-4" />} onClick={() => go('/search')}>
              Rechercher
            </Button>
            <Button size="sm" icon={<Compass className="h-4 w-4" />} onClick={() => go('/map')}>
              Me guider
            </Button>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div
        role="tablist"
        aria-label="Sections du tableau de bord"
        className="no-scrollbar mt-7 flex gap-1.5 overflow-x-auto border-b border-slate-100 pb-px"
      >
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`relative inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500 ${
                active ? 'text-hec-950' : 'text-slate-500 hover:text-hec-700'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              <span
                className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors ${
                  active ? 'bg-hec-950' : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </div>

      {tab === 'home' && (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <PwaInstallBanner />
            {/* CONTINUER L'EXPLORATION */}
            {lastSearchQuery && (
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-hec-100 bg-hec-50 p-4 sm:p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-hec-600 shadow-sm">
                    <Clock className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-hec-500">
                      Continuer vers
                    </p>
                    <p className="truncate font-display text-base font-bold text-hec-950">
                      {lastDestination?.name ?? lastSearchQuery}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  icon={<ArrowRight className="h-4 w-4" />}
                  onClick={() =>
                    lastDestination
                      ? go('/map', { loc: lastDestination.id })
                      : go('/search', { q: lastSearchQuery })
                  }
                  className="shrink-0"
                >
                  Reprendre
                </Button>
              </div>
            )}

            {/* CARTES PRINCIPALES */}
            <div>
              <SectionTitle icon={Sparkles} title="Cartes principales" />
              <div className="grid gap-3 sm:grid-cols-2">
                <QuickCard
                  title="Explorer le campus"
                  desc="Ouvrir la carte du campus."
                  icon={MapPin}
                  onClick={() => go('/map')}
                />

                <form
                  onSubmit={submitQuickSearch}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 focus-within:border-hec-200 focus-within:shadow-glass"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-hec-50 text-hec-600">
                    <Search className="h-5 w-5" />
                  </span>
                  <input
                    value={quickQuery}
                    onChange={(e) => setQuickQuery(e.target.value)}
                    placeholder="Rechercher un lieu…"
                    aria-label="Rechercher un lieu"
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-hec-950 placeholder:font-normal placeholder:text-slate-400 focus:outline-none"
                  />
                  {quickQuery && (
                    <button
                      type="button"
                      onClick={() => setQuickQuery('')}
                      aria-label="Effacer la recherche"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </form>

                <QuickCard
                  title="Mes favoris"
                  desc={`${favoriteLocations.length} lieu(x) enregistré(s)`}
                  icon={Heart}
                  onClick={() => setTab('favorites')}
                />
                <QuickCard
                  title="Dernière destination"
                  desc={lastDestination?.name ?? lastSearchQuery ?? 'Aucune recherche récente'}
                  icon={Clock}
                  onClick={() => (lastDestination ? go('/map', { loc: lastDestination.id }) : go('/search'))}
                />
              </div>
            </div>

            {/* ACTIONS RAPIDES */}
            <div>
              <SectionTitle icon={Compass} title="Actions rapides" />
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {[
                  { label: 'Carte', icon: MapPin, onClick: () => go('/map') },
                  { label: 'Rechercher', icon: Search, onClick: () => go('/search') },
                  { label: 'Me guider', icon: Compass, onClick: () => go('/map') },
                  { label: 'Favoris', icon: Heart, onClick: () => setTab('favorites') },
                  { label: 'Assistant', icon: Sparkles, onClick: () => go('/assistant') },
                  { label: 'Scanner QR', icon: QrCode, onClick: () => go('/qr') },
                ].map((a) => (
                  <button
                    key={a.label}
                    onClick={a.onClick}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-2 py-4 text-center transition-all hover:-translate-y-0.5 hover:border-hec-100 hover:shadow-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500 motion-reduce:hover:translate-y-0"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-hec-50 text-hec-600">
                      <a.icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="text-[11px] font-semibold leading-tight text-hec-950">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* LIEUX RÉCENTS */}
            {recentLocations.length > 0 && (
              <div>
                <SectionTitle icon={Clock} title="Lieux récents" />
                <div className="space-y-2">
                  {recentLocations.map((loc) => (
                    <LocationCard key={loc.id} location={loc} onClick={() => go('/map', { loc: loc.id })} />
                  ))}
                </div>
              </div>
            )}

            <div>
              <SectionTitle icon={MapPin} title="Lieux populaires" />
              <div className="space-y-2">
                {locations.slice(0, 5).map((loc) => (
                  <LocationCard key={loc.id} location={loc} onClick={() => go('/map', { loc: loc.id })} />
                ))}
              </div>
            </div>
          </div>

          {/* COLONNE LATÉRALE */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-5">
              <SectionTitle icon={CalendarDays} title="Prochains événements" />
              <div className="mt-3 space-y-3">
                {upcomingEvents.length === 0 && (
                  <p className="text-sm text-slate-500">Aucun événement.</p>
                )}
                {upcomingEvents.map((ev) => (
                  <div key={ev.id} className="flex gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-hec-50 text-center">
                      <span className="text-xs font-semibold text-hec-600">
                        {new Date(ev.starts_at).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-hec-950">{ev.title}</p>
                      <p className="truncate text-xs text-slate-500">{ev.location_label || ev.organizer}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5">
              <SectionTitle icon={Bell} title="Annonces" />
              <div className="mt-3 space-y-3">
                {announcements.length === 0 && (
                  <p className="text-sm text-slate-500">Aucune annonce.</p>
                )}
                {announcements.slice(0, 3).map((a) => (
                  <div key={a.id} className="rounded-xl bg-slate-50 p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-hec-500">
                      {categoryLabels[a.category] ?? a.category}
                    </span>
                    <p className="mt-1 text-sm font-semibold text-hec-950">{a.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{a.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'favorites' && (
        <div className="mt-6">
          <SectionTitle icon={Heart} title="Mes favoris" />
          {favoriteLocations.length === 0 ? (
            <EmptyState
              icon={<Heart className="h-5 w-5" />}
              title="Aucun favori"
              description="Vous n'avez pas encore ajouté de lieu à vos favoris."
            />
          ) : (
            <div className="space-y-2">
              {favoriteLocations.map((loc) => (
                <LocationCard key={loc.id} location={loc} onClick={() => go('/map', { loc: loc.id })} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'events' && (
        <div className="mt-6">
          <SectionTitle icon={CalendarDays} title="Événements du campus" />
          {upcomingEvents.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" />}
              title="Aucun événement"
              description="Les prochains événements du campus apparaîtront ici."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-2xl border border-slate-100 bg-white p-5 transition-shadow hover:shadow-glass"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-hec-500">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(ev.starts_at).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </div>
                  <h3 className="mt-2 font-display text-lg font-bold text-hec-950">{ev.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{ev.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {ev.location_label}
                    </span>
                    {ev.organizer && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {ev.organizer}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'news' && (
        <div className="mt-6">
          <SectionTitle icon={Bell} title="Annonces" />
          {announcements.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-5 w-5" />}
              title="Aucune annonce"
              description="Les annonces du campus apparaîtront ici."
            />
          ) : (
            <div className="space-y-2">
              {announcements.map((a) => (
                <div key={a.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-hec-500">
                      {categoryLabels[a.category] ?? a.category}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(a.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <p className="mt-1 font-semibold text-hec-950">{a.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{a.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-hec-500" />
      <h2 className="font-display text-lg font-bold text-hec-950">{title}</h2>
    </div>
  );
}

function QuickCard({
  title,
  desc,
  icon: Icon,
  onClick,
}: {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left transition-all hover:border-hec-200 hover:shadow-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-hec-50 text-hec-600 transition-colors group-hover:bg-hec-500 group-hover:text-white">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-hec-950">{title}</span>
        <span className="block truncate text-xs text-slate-500">{desc}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-hec-500 motion-reduce:group-hover:translate-x-0" />
    </button>
  );
}