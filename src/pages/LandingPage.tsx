import { useState, type FormEvent } from 'react';
import {
  Accessibility,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  Compass,
  Heart,
  Home as HomeIcon,
  LocateFixed,
  MapPinned,
  MessagesSquare,
  Navigation,
  QrCode,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button, EmptyState, Logo } from '@/components/ui';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { useNavigate } from '@/lib/router';
import { useCampus } from '@/context/CampusContext';
import { CampusImage } from '@/components/CampusImage';
import { LegalLinks } from '@/components/LegalLayout';
import { legalConfig } from '@/lib/legal-config';
import { HeroSlideshow } from '@/components/HeroSlideshow';
import { PublicNavbar, scrollToSection } from '@/components/PublicNavbar';
import { Reveal } from '@/components/Reveal';
import { HEC_PHOTOS } from '@/lib/hec-images';
import type { BuildingCategory } from '@/lib/types';

const categoryLabels: Record<BuildingCategory, string> = {
  academic: 'Académique',
  library: 'Bibliothèque',
  admin: 'Administration',
  student_life: 'Vie étudiante',
};

/** Photo d'illustration : petite (480 px) sur mobile, complète sinon. */
function HecPhotoImg({
  photo,
  className = '',
  sizes = '(min-width: 1024px) 40vw, 90vw',
}: {
  photo: (typeof HEC_PHOTOS)[keyof typeof HEC_PHOTOS];
  className?: string;
  sizes?: string;
}) {
  return (
    <img
      src={photo.src}
      srcSet={`${photo.small} 480w, ${photo.src} ${photo.width}w`}
      sizes={sizes}
      width={photo.width}
      height={photo.height}
      alt={photo.alt}
      loading="lazy"
      decoding="async"
      style={{ objectPosition: photo.position }}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}

interface FeatureCard {
  icon: LucideIcon;
  title: string;
  desc: string;
  tone: string;
}

const features: FeatureCard[] = [
  { icon: LocateFixed, title: 'Localisation', desc: 'Situez-vous sur le campus grâce au GPS de votre appareil.', tone: 'from-emerald-500 to-teal-600' },
  { icon: MapPinned, title: 'Carte interactive', desc: 'Plan, satellite ou relief : explorez le campus bâtiment par bâtiment.', tone: 'from-hec-500 to-hec-700' },
  { icon: Compass, title: 'Navigation', desc: 'Un itinéraire à pied vers votre destination, sur le réseau de chemins du campus.', tone: 'from-indigo-500 to-hec-600' },
  { icon: Building2, title: 'Bâtiments', desc: 'Fiches, photos et informations pour chaque bâtiment référencé.', tone: 'from-sky-500 to-hec-600' },
  { icon: Search, title: 'Recherche', desc: 'Retrouvez un lieu, une salle ou un service, même avec une faute de frappe.', tone: 'from-violet-500 to-indigo-600' },
  { icon: Smartphone, title: 'PWA', desc: 'Installez l’application sur votre écran d’accueil, comme une app native.', tone: 'from-hec-600 to-hec-800' },
  { icon: QrCode, title: 'QR codes', desc: 'Scannez un QR posé sur le campus pour ouvrir directement la fiche du lieu.', tone: 'from-slate-600 to-hec-900' },
  { icon: Accessibility, title: 'Accessibilité', desc: 'Itinéraire accessible, thème sombre, contrastes soignés, navigation au clavier.', tone: 'from-teal-500 to-emerald-600' },
  { icon: Bell, title: 'Notifications', desc: 'Restez informé des annonces publiées par l’administration.', tone: 'from-amber-500 to-orange-600' },
  { icon: Heart, title: 'Favoris', desc: 'Gardez vos lieux préférés à portée de main avec un compte.', tone: 'from-rose-500 to-pink-600' },
];

const howItWorks = [
  { step: '01', title: 'Recherchez', desc: 'Trouvez votre bâtiment ou service.' },
  { step: '02', title: 'Explorez', desc: 'Consultez sa position et ses informations.' },
  { step: '03', title: 'Naviguez', desc: 'Lancez le guidage depuis votre position.' },
];

const quickFinds: Array<{
  icon: typeof Building2;
  label: string;
  go?: string;
  kind?: string;
  q?: string;
}> = [
  { icon: Building2, label: 'Bâtiments', go: '/map' },
  { icon: HomeIcon, label: 'Salles', kind: 'room' },
  { icon: Users, label: 'Bureaux', kind: 'office' },
  { icon: MessagesSquare, label: 'Bibliothèque', q: 'bibliothèque' },
  { icon: CalendarDays, label: 'Cafétéria', q: 'cafétéria' },
  { icon: ShieldCheck, label: 'Services', kind: 'service' },
  { icon: MapPinned, label: "Points d'intérêt", kind: 'poi' },
];

const footerColumns = [
  {
    title: 'Navigation',
    links: [
      { label: 'Accueil', href: '/' },
      { label: 'Carte', href: '/map' },
      { label: 'Explorer', href: '/search' },
      { label: 'À propos', href: '/about' },
      { label: 'Aide', href: '/help' },
    ],
  },
  {
    title: 'Plateforme',
    links: [
      { label: 'Connexion', href: '/login' },
      { label: 'Créer un compte', href: '/register' },
      { label: 'Confidentialité', href: '/privacy' },
      { label: 'Conditions', href: '/terms' },
    ],
  },
];

export function LandingPage() {
  const go = useNavigate();
  const { campus, buildings, locations, events, announcements } = useCampus();
  const [heroQuery, setHeroQuery] = useState('');

  // Statistiques RÉELLES uniquement (masquées si la valeur est 0).
  const upcomingEvents = events.filter((ev) => new Date(ev.starts_at).getTime() >= Date.now()).length;
  const heroStats = [
    { label: 'Bâtiments', value: buildings.length },
    { label: 'Lieux référencés', value: locations.length },
    { label: 'Événements à venir', value: upcomingEvents },
  ].filter((st) => st.value > 0);

  // Exemple de recherche construit avec de VRAIS noms de lieux.
  const exampleNames = locations
    .filter((l) => l.kind === 'poi' || l.kind === 'service')
    .slice(0, 3)
    .map((l) => l.name);
  const searchPlaceholder =
    exampleNames.length > 0
      ? `Où souhaitez-vous aller ? ${exampleNames.join(', ')}…`
      : 'Rechercher un bâtiment, une salle, un service…';

  const submitHeroSearch = (e: FormEvent) => {
    e.preventDefault();
    if (heroQuery.trim()) go('/search', { q: heroQuery.trim() });
    else go('/search');
  };

  // Bâtiments réellement présents en base (jamais inventés) ; ceux avec
  // photo d'abord. Un bâtiment sans photo affiche « Photo à venir ».
  const showcaseBuildings = [...buildings]
    .filter((b) => !b.archived_at)
    .sort((a, b) => Number(!!b.primary_image_url) - Number(!!a.primary_image_url))
    .slice(0, 6);

  const news = [
    ...announcements.slice(0, 2).map((a) => ({
      id: a.id,
      kind: 'announcement' as const,
      title: a.title,
      body: a.body,
      date: a.created_at,
    })),
    ...events.slice(0, 2).map((ev) => ({
      id: ev.id,
      kind: 'event' as const,
      title: ev.title,
      body: ev.description,
      date: ev.starts_at,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);

  return (
    <div id="top" className="min-h-screen bg-white text-hec-950">
      <PublicNavbar />

      {/* ============ HERO — slideshow des 7 photos HEC ============ */}
      <HeroSlideshow>
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            HEC Localisation
          </div>
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Le campus HEC,
            <br />
            à portée de carte.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/85">
            Découvrez, recherchez et explorez intelligemment votre campus.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" icon={<ArrowRight className="h-5 w-5" />} onClick={() => go('/map')} className="w-full sm:w-auto">
              Explorer la carte
            </Button>
            <Button size="lg" variant="glass" onClick={() => scrollToSection('discover')} className="w-full sm:w-auto">
              Découvrir le campus
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Recherche : envoie une vraie requête à /search */}
          <form onSubmit={submitHeroSearch} role="search" className="mt-6 max-w-xl">
            <div className="flex items-center gap-2 rounded-2xl border border-white/30 bg-white p-1.5 shadow-panel">
              <Search className="ml-2.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                value={heroQuery}
                onChange={(e) => setHeroQuery(e.target.value)}
                aria-label="Rechercher un lieu du campus"
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-hec-950 placeholder:text-slate-400 focus:outline-none"
              />
              <Button type="submit" size="sm" className="shrink-0">
                Rechercher
              </Button>
            </div>
          </form>

          {heroStats.length > 0 && (
            <dl className="mt-6 flex flex-wrap gap-2.5">
              {heroStats.map((st) => (
                <div key={st.label} className="flex items-baseline gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 backdrop-blur">
                  <dd className="font-display text-base font-extrabold text-white">{st.value}</dd>
                  <dt className="text-xs font-medium text-white/75">{st.label}</dt>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-5 max-w-xl">
            <PwaInstallBanner />
          </div>
        </div>
      </HeroSlideshow>

      {/* ============ TROUVEZ RAPIDEMENT ============ */}
      <section className="border-b border-slate-100 py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal>
            <h2 className="font-display text-2xl font-bold text-hec-950 sm:text-3xl">Trouvez rapidement</h2>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {quickFinds.map((item) => (
                <button
                  key={item.label}
                  onClick={() =>
                    item.go ? go(item.go) : go('/search', item.kind ? { kind: item.kind } : { q: item.q as string })
                  }
                  className="flex min-h-[44px] flex-col items-center gap-2.5 rounded-2xl border border-slate-100 bg-white px-3 py-5 text-center transition-all duration-200 hover:-translate-y-1 hover:border-hec-100 hover:shadow-panel focus:outline-none focus-visible:ring-4 focus-visible:ring-hec-200 motion-reduce:transform-none"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-hec-50 text-hec-600">
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold text-hec-950">{item.label}</span>
                </button>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ DÉCOUVRIR HEC ============ */}
      <section id="discover" className="scroll-mt-20 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-hec-500">Haute École de Commerce de Kinshasa</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-hec-950 sm:text-5xl">Découvrez la HEC autrement.</h2>
          </Reveal>

          <div className="mt-12 grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
            {/* Mosaïque asymétrique : 1 grande photo + 2 plus petites */}
            <Reveal className="lg:col-span-7">
              <div className="grid grid-cols-5 grid-rows-2 gap-3 sm:gap-4">
                <div className="col-span-3 row-span-2 aspect-[3/4] overflow-hidden rounded-3xl shadow-panel">
                  <HecPhotoImg photo={HEC_PHOTOS.buildingPalms} className="transition-transform duration-700 hover:scale-[1.03] motion-reduce:transform-none" sizes="(min-width: 1024px) 30vw, 55vw" />
                </div>
                <div className="col-span-2 overflow-hidden rounded-3xl shadow-glass">
                  <HecPhotoImg photo={HEC_PHOTOS.gardens} className="transition-transform duration-700 hover:scale-[1.04] motion-reduce:transform-none" sizes="(min-width: 1024px) 20vw, 35vw" />
                </div>
                <div className="col-span-2 overflow-hidden rounded-3xl shadow-glass">
                  <HecPhotoImg photo={HEC_PHOTOS.classroom} className="transition-transform duration-700 hover:scale-[1.04] motion-reduce:transform-none" sizes="(min-width: 1024px) 20vw, 35vw" />
                </div>
              </div>
            </Reveal>
            <Reveal className="lg:col-span-5" delay={120}>
              <h3 className="font-display text-2xl font-bold text-hec-950 sm:text-3xl">Votre campus, autrement</h3>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Localisez les bâtiments, explorez les services et trouvez votre destination en quelques secondes.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-2">
                <Button size="lg" icon={<ArrowRight className="h-5 w-5" />} onClick={() => go('/map')}>
                  Explorer le campus
                </Button>
                <Button variant="link" onClick={() => go('/about')}>
                  En savoir plus
                </Button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============ VOTRE CAMPUS SUR UNE CARTE ============ */}
      <section className="bg-hec-950 py-20 text-white lg:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-2 lg:px-8">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-hec-300">Cartographie intelligente</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-white sm:text-5xl">Votre campus sur une carte.</h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-white/75">
              Une carte interactive du campus HEC, pour rechercher, repérer et rejoindre chaque lieu.
            </p>
            <ul className="mt-7 flex flex-wrap gap-2.5">
              {[
                { icon: Search, label: 'Recherche' },
                { icon: Building2, label: 'Bâtiments' },
                { icon: ShieldCheck, label: 'Services' },
                { icon: Navigation, label: 'Navigation' },
                { icon: LocateFixed, label: 'GPS' },
              ].map((c) => (
                <li key={c.label} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-sm font-medium text-white">
                  <c.icon className="h-4 w-4 text-hec-300" aria-hidden="true" />
                  {c.label}
                </li>
              ))}
            </ul>
            <Button size="lg" className="mt-8" icon={<MapPinned className="h-5 w-5" />} onClick={() => go('/map')}>
              Ouvrir la carte
            </Button>
          </Reveal>
          <Reveal delay={120}>
            <button
              onClick={() => go('/map')}
              aria-label="Ouvrir la carte interactive du campus"
              className="group relative block w-full overflow-hidden rounded-3xl border border-white/15 shadow-panel focus:outline-none focus-visible:ring-4 focus-visible:ring-hec-300/60"
            >
              <div className="aspect-[4/3]">
                <HecPhotoImg photo={HEC_PHOTOS.gardens} className="transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transform-none" sizes="(min-width: 1024px) 45vw, 92vw" />
              </div>
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-hec-950/80 via-transparent to-transparent" />
              <span className="absolute bottom-4 left-4 inline-flex h-11 items-center gap-2 rounded-xl bg-hec-500 px-4 text-sm font-semibold text-white shadow-glass transition-transform group-hover:scale-[1.03]">
                <MapPinned className="h-4 w-4" aria-hidden="true" />
                Voir la carte interactive
              </span>
            </button>
          </Reveal>
        </div>
      </section>

      {/* ============ BÂTIMENTS (données Supabase réelles) ============ */}
      <section id="buildings" className="scroll-mt-20 bg-slate-50 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-hec-500">Bâtiments</p>
              <h2 className="mt-2 font-display text-3xl font-bold text-hec-950 sm:text-4xl">Les bâtiments du campus</h2>
            </div>
            <Button variant="secondary" onClick={() => go('/map')}>
              Voir tous sur la carte
            </Button>
          </Reveal>

          {showcaseBuildings.length === 0 ? (
            <div className="mt-10">
              <EmptyState
                icon={<Building2 className="h-6 w-6" />}
                title="Aucun bâtiment publié pour le moment"
                description="Les bâtiments ajoutés par l'administration apparaîtront ici."
                action={<Button onClick={() => go('/map')}>Ouvrir la carte</Button>}
              />
            </div>
          ) : (
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {showcaseBuildings.map((b, idx) => (
                <Reveal key={b.id} delay={Math.min(idx, 3) * 60}>
                  <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-panel motion-reduce:transform-none">
                    <CampusImage
                      sources={[b.primary_image_url]}
                      alt={`Photo : ${b.name}`}
                      className="aspect-[16/10] bg-slate-100"
                      imgClassName="transition-transform duration-700 group-hover:scale-[1.04] motion-reduce:transform-none"
                      width={640}
                      height={400}
                    />
                    <div className="flex flex-1 flex-col p-5">
                      <span className="inline-flex w-fit rounded-full bg-hec-50 px-2.5 py-0.5 text-[11px] font-semibold text-hec-700">
                        {categoryLabels[b.category] ?? b.category}
                      </span>
                      <h3 className="mt-2 font-display text-lg font-bold text-hec-950">{b.name}</h3>
                      {b.description && <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{b.description}</p>}
                      <div className="mt-auto flex gap-2 pt-4">
                        <Button size="sm" variant="secondary" onClick={() => go('/map', { building: b.id })} className="flex-1">
                          Voir sur la carte
                        </Button>
                        <Button size="sm" icon={<Navigation className="h-4 w-4" />} onClick={() => go('/map', { building: b.id, guide: '1' })} className="flex-1">
                          Me guider
                        </Button>
                      </div>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ============ SMART NAVIGATION ============ */}
      <section className="relative isolate overflow-hidden bg-hec-950 py-24 text-white lg:py-36">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <HecPhotoImg photo={HEC_PHOTOS.nightBuilding} sizes="100vw" />
          <div className="absolute inset-0 bg-gradient-to-r from-hec-950/90 via-hec-950/65 to-hec-950/30" />
        </div>
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal className="max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-hec-300">Smart Navigation</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-white sm:text-5xl">Ne cherchez plus votre chemin.</h2>
            <p className="mt-5 text-base leading-relaxed text-white/80">
              HEC Localisation vous accompagne pour retrouver rapidement les espaces et services du campus.
            </p>
            <Button size="lg" className="mt-8" icon={<Navigation className="h-5 w-5" />} onClick={() => go('/map')}>
              Commencer la navigation
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ============ FONCTIONNALITÉS ============ */}
      <section id="features" className="scroll-mt-20 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-hec-500">Une plateforme complète</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-hec-950 sm:text-4xl">Tout le campus, dans une seule application.</h2>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {features.map((f, idx) => (
              <Reveal key={f.title} delay={(idx % 5) * 50}>
                <div className="group relative h-full overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-hec-100 hover:shadow-panel motion-reduce:transform-none">
                  <div className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${f.tone} text-white shadow-glass`}>
                    <f.icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-bold text-hec-950">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ COMMENT ÇA MARCHE ============ */}
      <section className="bg-slate-50 py-20 lg:py-28">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <Reveal>
            <h2 className="text-center font-display text-3xl font-bold text-hec-950 sm:text-4xl">Comment ça marche</h2>
          </Reveal>
          {/* Ligne horizontale (desktop) / timeline verticale (mobile) */}
          <ol className="relative mt-14 grid gap-10 lg:grid-cols-3 lg:gap-8">
            <div aria-hidden="true" className="absolute left-7 top-7 h-[calc(100%-3.5rem)] w-px bg-hec-200 lg:left-[16.66%] lg:right-[16.66%] lg:top-7 lg:h-px lg:w-auto" />
            {howItWorks.map((st, i) => (
              <li key={st.step} className="relative flex gap-5 lg:flex-col lg:items-center lg:gap-0 lg:text-center">
                <Reveal delay={i * 100} className="flex gap-5 lg:flex-col lg:items-center">
                  <span className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-hec-950 font-display text-lg font-bold text-white shadow-glass ring-4 ring-slate-50">
                    {st.step}
                  </span>
                  <div className="lg:mt-5">
                    <h3 className="font-display text-lg font-bold text-hec-950">{st.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{st.desc}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ============ ACTUALITÉS ============ */}
      <section id="news" className="scroll-mt-20 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-3xl font-bold text-hec-950 sm:text-4xl">Actualités</h2>
            <Button variant="ghost" size="sm" onClick={() => go('/events')}>
              Voir toutes les actualités
            </Button>
          </div>
          {news.length === 0 ? (
            <div className="mt-10">
              <EmptyState
                icon={<CalendarDays className="h-6 w-6" />}
                title="Aucune actualité pour le moment"
                description="Les annonces et événements publiés par l'administration apparaîtront ici."
              />
            </div>
          ) : (
            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {news.map((n) => (
                <div key={n.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-glass">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-hec-50 px-2.5 py-1 text-[11px] font-semibold text-hec-600">
                    {n.kind === 'event' ? (
                      <>
                        <CalendarDays className="h-3 w-3" /> Événement
                      </>
                    ) : (
                      <>
                        <Bell className="h-3 w-3" /> Actualité
                      </>
                    )}
                  </span>
                  <p className="mt-3 font-display text-base font-bold text-hec-950">{n.title}</p>
                  <p className="mt-1.5 line-clamp-3 text-sm text-slate-600">{n.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ============ CTA FINAL ============ */}
      <section className="relative isolate overflow-hidden bg-hec-950 py-20 text-white lg:py-28">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <HecPhotoImg photo={HEC_PHOTOS.nightPalm} sizes="100vw" />
          <div className="absolute inset-0 bg-hec-950/80" />
        </div>
        <div className="mx-auto max-w-4xl px-5 text-center lg:px-8">
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">Prêt à explorer le campus HEC ?</h2>
          <p className="mt-4 text-white/80">
            Lancez-vous en quelques secondes. La carte est publique, créez un compte pour enregistrer vos favoris et votre historique.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" icon={<ArrowRight className="h-5 w-5" />} onClick={() => go('/map')} className="w-full sm:w-auto">
              Explorer le campus
            </Button>
            <Button size="lg" variant="glass" onClick={() => go('/register')} className="w-full sm:w-auto">
              Créer un compte
            </Button>
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/70">
            <MessagesSquare className="h-4 w-4" aria-hidden="true" />
            <button onClick={() => go('/help')} className="underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
              Besoin d'aide ? Ouvrir le centre d'aide
            </button>
          </div>
        </div>
      </section>

      {/* ============ FOOTER INSTITUTIONNEL ============ */}
      <footer className="border-t border-slate-100 bg-white py-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Logo size="sm" />
              <p className="mt-4 max-w-[260px] text-sm text-slate-500">
                HEC LOCALISATION — la plateforme Smart Campus de la Haute École de Commerce de Kinshasa.
              </p>
              <p className="mt-3 max-w-[260px] text-sm font-medium text-hec-900">
                Une solution numérique dédiée à l'expérience du campus.
              </p>
            </div>
            {footerColumns.map((col) => (
              <div key={col.title}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{col.title}</p>
                <ul className="mt-3 space-y-1">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <button
                        onClick={() => go(link.href)}
                        className="min-h-[36px] text-sm text-slate-600 hover:text-hec-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-hec-300"
                      >
                        {link.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Institution</p>
              <p className="mt-3 text-sm font-semibold text-hec-950">Haute École de Commerce de Kinshasa</p>
              {legalConfig.contactEmail ? (
                <p className="mt-1 text-sm">
                  <a href={`mailto:${legalConfig.contactEmail}`} className="text-hec-600 underline">
                    {legalConfig.contactEmail}
                  </a>
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">Les coordonnées officielles seront publiées ici par l'administration.</p>
              )}
              {campus?.name && <p className="mt-1 text-sm text-slate-500">{campus.name}</p>}
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-6 sm:flex-row">
            <p className="text-xs text-slate-400">© {new Date().getFullYear()} HEC Localisation · Haute École de Commerce de Kinshasa</p>
            <LegalLinks />
          </div>
        </div>
      </footer>
    </div>
  );
}
