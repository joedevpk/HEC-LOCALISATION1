import {
  Accessibility,
  BookOpen,
  Building2,
  Compass,
  Info,
  Landmark,
  Mail,
  MapPinned,
  Navigation,
  QrCode,
  Search,
  ShieldCheck,
  Smartphone,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { useCampus } from '@/context/CampusContext';
import { EmptyState } from '@/components/ui';
import { HEC_PHOTOS } from '@/lib/hec-images';

interface Section {
  icon: LucideIcon;
  title: string;
  body: string;
}

// Textes décrivant l'APPLICATION (ce qu'elle fait réellement) — aucun
// fait historique, chiffre ou contact sur l'institution n'est affirmé
// ici : ces informations viendront de l'administration.
const sections: Section[] = [
  {
    icon: Landmark,
    title: 'Présentation',
    body: "HEC Localisation est une solution numérique d'orientation pour le campus de la Haute École de Commerce de Kinshasa : retrouver un bâtiment, une salle, un bureau ou un service, et s'y rendre.",
  },
  {
    icon: Target,
    title: 'Mission',
    body: "Faciliter l'accueil et les déplacements des étudiants, du personnel et des visiteurs, en rendant les informations du campus accessibles depuis un smartphone ou un ordinateur.",
  },
  {
    icon: Search,
    title: 'Fonctionnalités',
    body: 'Recherche tolérante aux fautes de frappe, fiches détaillées avec photos, favoris, événements, annonces, signalements et assistant intégré.',
  },
  {
    icon: MapPinned,
    title: 'Cartographie',
    body: "Carte interactive du campus avec plusieurs fonds (plan, satellite, hybride, relief, sombre) et points d'intérêt à proximité.",
  },
  {
    icon: Navigation,
    title: 'Navigation',
    body: "Itinéraire à pied calculé uniquement sur le réseau piéton réellement saisi par l'administration. Si une zone n'est pas encore configurée, l'application l'indique clairement au lieu de tracer un faux chemin.",
  },
  {
    icon: Accessibility,
    title: 'Accessibilité',
    body: "Option d'itinéraire accessible (mobilité réduite), thème sombre, contrastes soignés, navigation au clavier et respect des préférences de réduction des animations.",
  },
  {
    icon: QrCode,
    title: 'QR codes',
    body: "Des QR codes posés sur le campus ouvrent directement la fiche du lieu concerné, sans installation ni saisie.",
  },
  {
    icon: Smartphone,
    title: 'Application mobile (PWA)',
    body: "L'application s'installe sur l'écran d'accueil et reste ouvrable sans connexion pour les contenus déjà consultés. La carte et la géolocalisation nécessitent une connexion.",
  },
  {
    icon: ShieldCheck,
    title: 'Administration',
    body: "Un espace réservé aux administrateurs permet de gérer les bâtiments, les lieux, les photos, les QR codes et le réseau de chemins, avec des droits d'accès contrôlés.",
  },
];

export function AboutPage() {
  const { campus, buildings, locations } = useCampus();

  // Statistiques RÉELLES uniquement (valeurs présentes en base).
  const stats = [
    { label: 'Bâtiments', value: buildings.length, icon: Building2 },
    { label: 'Lieux référencés', value: locations.length, icon: MapPinned },
    {
      label: 'Services',
      value: locations.filter((l) => l.kind === 'service').length,
      icon: BookOpen,
    },
  ].filter((s) => s.value > 0);

  const services = locations.filter((l) => l.kind === 'service');

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 lg:px-8 lg:py-10">
      {/* En-tête : vraie photo du campus HEC */}
      <header className="relative isolate overflow-hidden rounded-3xl bg-hec-950 text-white shadow-panel">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <img
            src={HEC_PHOTOS.entrance.src}
            srcSet={`${HEC_PHOTOS.entrance.small} 480w, ${HEC_PHOTOS.entrance.src} 810w`}
            sizes="(min-width: 1024px) 64rem, 100vw"
            alt=""
            decoding="async"
            style={{ objectPosition: HEC_PHOTOS.entrance.position }}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-hec-950/95 via-hec-950/65 to-hec-950/35" />
        </div>
        <div className="relative px-6 pb-8 pt-28 sm:px-10 sm:pt-40">
          <p className="text-xs font-semibold uppercase tracking-wider text-hec-200">
            {campus?.name ?? 'Haute École de Commerce de Kinshasa'}
            {campus?.city ? ` · ${campus.city}` : ''}
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-white sm:text-5xl">
            Une nouvelle manière d'explorer le campus.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">
            HEC Localisation : la solution numérique d'orientation et de découverte du campus HEC Kinshasa.
          </p>
        </div>
      </header>

      {stats.length > 0 && (
        <dl className="mt-6 grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-100 bg-white p-4 text-center">
              <s.icon className="mx-auto h-5 w-5 text-hec-500" aria-hidden="true" />
              <dd className="mt-2 font-display text-xl font-extrabold text-hec-950">{s.value}</dd>
              <dt className="text-[11px] text-slate-500">{s.label}</dt>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <section
            key={s.title}
            className="rounded-2xl border border-slate-100 bg-white p-5 transition-shadow hover:shadow-glass"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-hec-50 text-hec-600" aria-hidden="true">
              <s.icon className="h-5 w-5" />
            </span>
            <h2 className="mt-3 font-display text-lg font-bold text-hec-950">{s.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-8 space-y-4">
        <section className="rounded-2xl border border-slate-100 bg-white p-5">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-hec-500" aria-hidden="true" />
            <h2 className="font-display text-lg font-bold text-hec-950">Services du campus</h2>
          </div>
          {services.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon={<Info className="h-5 w-5" />}
                title="Aucun service référencé"
                description="Les services du campus apparaîtront ici une fois ajoutés par l'administration."
              />
            </div>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {services.slice(0, 12).map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-hec-950"
                >
                  <MapPinned className="h-3.5 w-3.5 text-hec-500" aria-hidden="true" />
                  {l.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-5">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-hec-500" aria-hidden="true" />
            <h2 className="font-display text-lg font-bold text-hec-950">Contacts officiels</h2>
          </div>
          <div className="mt-3">
            <EmptyState
              icon={<Info className="h-5 w-5" />}
              title="Contacts à venir"
              description="Les coordonnées officielles de l'établissement seront ajoutées ici par l'administration."
            />
          </div>
        </section>
      </div>
    </div>
  );
}
