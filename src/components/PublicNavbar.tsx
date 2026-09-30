import { useEffect, useState } from 'react';
import { Menu, Navigation, Search, X } from 'lucide-react';
import { Button, Logo } from '@/components/ui';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeSegmented, ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from '@/lib/router';

interface NavItem {
  label: string;
  /** Route interne (routeur par hash). */
  path?: string;
  /** Ancre de section de la page d'accueil (défilement, sans toucher au hash). */
  section?: string;
}

const desktopItems: NavItem[] = [
  { label: 'Accueil', section: 'top' },
  { label: 'Carte', path: '/map' },
  { label: 'Explorer', path: '/search' },
  { label: 'Bâtiments', section: 'buildings' },
  { label: 'Événements', path: '/events' },
  { label: 'À propos', path: '/about' },
];

const mobileItems: NavItem[] = [
  { label: 'Carte', path: '/map' },
  { label: 'Explorer', path: '/search' },
  { label: 'Bâtiments', section: 'buildings' },
  { label: 'Événements', path: '/events' },
  { label: 'Favoris', path: '/favorites' },
  { label: 'À propos', path: '/about' },
  { label: 'Paramètres', path: '/settings' },
];

/** Défile vers une section de la page d'accueil. Le routeur étant basé sur
 * location.hash, on n'utilise JAMAIS href="#section" (cela casserait la route). */
export function scrollToSection(id: string) {
  if (id === 'top') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Barre de navigation publique : transparente sur le hero, puis verre dépoli
 * (blur + bordure + ombre) dès que l'on défile ; sticky. Menu mobile en
 * panneau défilant qui ne dépasse jamais de l'écran.
 */
export function PublicNavbar() {
  const go = useNavigate();
  const { session, profile } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const solid = scrolled || open;

  const activate = (item: NavItem) => {
    setOpen(false);
    if (item.section) scrollToSection(item.section);
    else if (item.path) go(item.path);
  };

  const linkClass = solid
    ? 'text-slate-600 hover:bg-hec-50 hover:text-hec-700'
    : 'text-white/85 hover:bg-white/10 hover:text-white';

  const initials = (profile?.full_name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${
        solid
          ? 'glass border-slate-200/70 shadow-glass'
          : 'border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 lg:h-[72px] lg:px-8">
        <button
          onClick={() => {
            setOpen(false);
            scrollToSection('top');
          }}
          aria-label="HEC Localisation — retour en haut de l'accueil"
          className="rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-hec-300/60"
        >
          <Logo inverted={!solid} />
        </button>

        <nav aria-label="Navigation principale" className="hidden items-center gap-1 lg:flex">
          {desktopItems.map((item) => (
            <button
              key={item.label}
              onClick={() => activate(item)}
              className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-hec-300/50 ${linkClass}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={() => go('/search')}
            aria-label="Rechercher un lieu"
            className={`grid h-11 w-11 place-items-center rounded-xl transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-hec-300/50 ${linkClass}`}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
          <ThemeToggle buttonClass={linkClass} />
          <div className="hidden lg:block">
            <LanguageSwitcher compact menuPosition="down" />
          </div>

          {session ? (
            <button
              onClick={() => go('/dashboard')}
              aria-label="Ouvrir mon espace"
              className="hidden h-11 w-11 place-items-center overflow-hidden rounded-full border border-white/30 bg-hec-500 text-sm font-bold text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-hec-300/60 sm:grid"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initials || 'HEC'
              )}
            </button>
          ) : (
            <Button
              variant={solid ? 'secondary' : 'glass'}
              size="sm"
              onClick={() => go('/login')}
              className="hidden sm:inline-flex"
            >
              Connexion
            </Button>
          )}

          <Button
            size="sm"
            icon={<Navigation className="h-4 w-4" />}
            onClick={() => go('/map')}
            className="hidden sm:inline-flex"
          >
            Me guider
          </Button>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
            aria-controls="public-mobile-menu"
            className={`grid h-11 w-11 place-items-center rounded-xl transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-hec-300/50 lg:hidden ${linkClass}`}
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="public-mobile-menu"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-slate-100 bg-white px-5 pb-6 pt-3 shadow-panel animate-fade-in lg:hidden"
        >
          <nav aria-label="Menu mobile" className="flex flex-col">
            {mobileItems.map((item) => (
              <button
                key={item.label}
                onClick={() => activate(item)}
                className="flex min-h-[48px] items-center rounded-xl px-3 text-left text-base font-medium text-slate-700 hover:bg-hec-50 hover:text-hec-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-hec-200"
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Thème</p>
            <ThemeSegmented />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <LanguageSwitcher compact menuPosition="down" />
          </div>
          <div className="mt-3 grid gap-2">
            <Button
              size="lg"
              icon={<Navigation className="h-5 w-5" />}
              onClick={() => {
                setOpen(false);
                go('/map');
              }}
              className="w-full"
            >
              Me guider
            </Button>
            {!session && (
              <Button
                variant="secondary"
                size="lg"
                onClick={() => {
                  setOpen(false);
                  go('/login');
                }}
                className="w-full"
              >
                Connexion
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
