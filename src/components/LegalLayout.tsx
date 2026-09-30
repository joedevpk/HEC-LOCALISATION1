import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Info, Mail, ShieldCheck } from 'lucide-react';
import { useNavigate } from '@/lib/router';
import { legalConfig } from '@/lib/legal-config';
import { CampusImage } from '@/components/CampusImage';

export interface TocItem {
  id: string;
  label: string;
}

/** Liens légaux — source unique pour les pieds de page et les paramètres. */
export const LEGAL_LINKS: { path: string; label: string }[] = [
  { path: '/privacy', label: 'Politique de confidentialité' },
  { path: '/terms', label: "Conditions d'utilisation" },
  { path: '/cookies', label: 'Politique de cookies' },
  { path: '/billing', label: 'Tarifs et paiements' },
];

/**
 * Navigation légale (pied de page). Utilise le routeur de l'application
 * (hash) — pas de véritables ancres `#id`, qui casseraient le routage.
 */
export function LegalLinks({ className = '' }: { className?: string }) {
  const go = useNavigate();
  const items = [
    ...LEGAL_LINKS,
    { path: '/settings?section=privacy', label: 'Préférences de confidentialité' },
    { path: '/about', label: 'À propos' },
    { path: '/help', label: 'Contact et aide' },
  ];
  return (
    <nav aria-label="Informations légales" className={className}>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {items.map((item) => {
          const [path, query] = item.path.split('?');
          return (
            <li key={item.path}>
              <button
                type="button"
                onClick={() => go(path, query ? Object.fromEntries(new URLSearchParams(query)) : undefined)}
                className="rounded font-medium text-slate-500 underline-offset-4 hover:text-hec-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Encart d'information ou d'avertissement à l'intérieur d'un texte légal. */
export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn';
  title?: string;
  children: ReactNode;
}) {
  const warn = tone === 'warn';
  const Icon = warn ? AlertTriangle : Info;
  return (
    <div
      role="note"
      className={`my-4 flex gap-3 rounded-2xl border px-4 py-3.5 text-sm ${
        warn
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-hec-100 bg-hec-50 text-hec-800'
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 leading-relaxed">
        {title && <p className="mb-0.5 font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7"
    >
      <h2 id={`${id}-title`} className="font-display text-xl font-bold text-hec-950">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-600 [&_a]:font-medium [&_a]:text-hec-600 [&_a]:underline [&_li]:mt-1.5 [&_strong]:text-hec-950 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** Tableau responsive (défile horizontalement dans son propre conteneur). */
export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="-mx-1 overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="px-3.5 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 align-top">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={`px-3.5 py-3 ${j === 0 ? 'font-semibold text-hec-950' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Bloc contact : affiche UNIQUEMENT les coordonnées officielles
 * réellement configurées (voir lib/legal-config.ts). Sinon, un encart
 * honnête « à renseigner » — jamais une adresse inventée.
 */
export function ContactBlock() {
  const { contactEmail, contactPhone, contactAddress, entity, institutionName } = legalConfig;
  if (!contactEmail && !contactPhone && !contactAddress) {
    return (
      <Callout tone="warn" title="Coordonnées officielles à renseigner">
        Les coordonnées officielles de contact de {entity ?? institutionName} ne sont pas encore
        publiées dans cette application. En attendant, adressez-vous à l'administration de
        l'établissement ou au personnel du campus.
      </Callout>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
      <p className="font-semibold text-hec-950">{entity ?? institutionName}</p>
      {contactEmail && (
        <p className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-hec-500" aria-hidden="true" />
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </p>
      )}
      {contactPhone && <p>Téléphone : {contactPhone}</p>}
      {contactAddress && <p>Adresse : {contactAddress}</p>}
    </div>
  );
}

/**
 * Gabarit commun des pages légales : héro sobre (photo réelle du campus
 * si elle a été fournie, sinon dégradé HEC), sommaire, sections en
 * cartes, pied de page légal. Lisible sur mobile, centré sur desktop.
 */
export function LegalLayout({
  title,
  subtitle,
  toc,
  children,
}: {
  title: string;
  subtitle: string;
  toc: TocItem[];
  children: ReactNode;
}) {
  const go = useNavigate();

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — HEC Localisation`;
    window.scrollTo({ top: 0 });
    return () => {
      document.title = previous;
    };
  }, [title]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 lg:px-8 lg:py-10">
      <button
        type="button"
        onClick={() => go('/')}
        className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-hec-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Accueil
      </button>

      <header className="relative overflow-hidden rounded-3xl bg-hec-950 text-white shadow-panel">
        <CampusImage
          sources={['/images/campus/hero-campus.jpg']}
          alt=""
          className="absolute inset-0"
          fallback={
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(30,94,255,0.45),_transparent_60%),linear-gradient(160deg,_#111d47,_#152c72)]"
            />
          }
        />
        <div aria-hidden="true" className="absolute inset-0 bg-hec-950/70" />
        <div className="relative px-6 py-9 sm:px-10 sm:py-12">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            HEC Localisation
          </p>
          <h1 className="mt-4 font-display text-3xl font-extrabold text-white sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-base text-white/80">{subtitle}</p>
          <p className="mt-4 text-xs text-white/60">Dernière mise à jour : {legalConfig.lastUpdated}</p>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Sommaire" className="hidden lg:block">
          <ol className="sticky top-6 space-y-1 text-sm">
            {toc.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => scrollTo(item.id)}
                  className="w-full rounded-lg px-3 py-2 text-left font-medium text-slate-500 hover:bg-slate-100 hover:text-hec-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
                >
                  <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="space-y-4">{children}</div>
      </div>

      <footer className="mt-10 border-t border-slate-100 pt-6">
        <p className="text-sm font-semibold text-hec-950">HEC LOCALISATION</p>
        <p className="mb-3 text-xs text-slate-500">{legalConfig.institutionName}</p>
        <LegalLinks />
      </footer>
    </div>
  );
}
