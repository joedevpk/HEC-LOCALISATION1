import { useState } from 'react';
import {
  ArrowRight,
  Building2,
  BookOpen,
  GraduationCap,
  Home,
  MapPin,
  Navigation,
  Sparkles,
  Users,
  Utensils,
  CheckCircle,
} from 'lucide-react';
import { useCampus } from '@/context/CampusContext';
import { useSettings } from '@/context/SettingsContext';
import { useNavigate } from '@/lib/router';
import type { CampusLocation } from '@/lib/types';
import { Button } from '@/components/ui';

interface TourStep {
  title: string;
  desc: string;
  icon: typeof MapPin;
  findQuery: string;
}

const steps: TourStep[] = [
  { title: 'Bienvenue à HEC', desc: "Bienvenue sur le campus HEC Kinshasa. Suivez ce parcours pour découvrir les lieux essentiels.", icon: Home, findQuery: 'entrée' },
  { title: "L'Administration", desc: "Le service de scolarité et le rectorat se trouvent dans le bâtiment Administration. C'est ici que vous inscrire et demander vos documents.", icon: Building2, findQuery: 'scolarité' },
  { title: 'Les départements', desc: "Les salles de cours et amphithéâtres sont répartis dans les bâtiments A, B et C selon votre département.", icon: GraduationCap, findQuery: 'amphithéâtre' },
  { title: 'La bibliothèque', desc: "La bibliothèque universitaire offre des espaces de lecture et de travail silencieux, ouverte à tous les étudiants.", icon: BookOpen, findQuery: 'bibliothèque' },
  { title: 'Les salles de cours', desc: "Chaque salle est identifiée par un code (ex: B204). Utilisez la recherche ou la carte pour les trouver.", icon: MapPin, findQuery: 'B204' },
  { title: 'Les services', desc: "Le restaurant universitaire et les espaces de vie étudiante sont dans la Maison de l'Étudiant.", icon: Utensils, findQuery: 'restaurant' },
  { title: 'Points importants', desc: "Repérez les entrées, sorties et points de rassemblement. En cas d'urgence, suivez les indications.", icon: Users, findQuery: 'entrée principale' },
];

export function TourPage() {
  const { locations } = useCampus();
  const { t } = useSettings();
  const go = useNavigate();
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);

  const current = steps[step];
  const isLast = step === steps.length - 1;

  const findLoc = (q: string): CampusLocation | undefined => {
    const lower = q.toLowerCase();
    return locations.find(
      (l) =>
        l.name.toLowerCase().includes(lower) ||
        l.code.toLowerCase().includes(lower) ||
        l.category.toLowerCase().includes(lower),
    );
  };

  const loc = findLoc(current.findQuery);

  if (finished) {
    return (
      <div className="mx-auto max-w-lg px-5 py-10 text-center lg:py-16">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle className="h-8 w-8" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-hec-950">
          Visite terminée !
        </h1>
        <p className="mt-2 text-slate-600">
          Vous connaissez désormais les lieux essentiels du campus HEC. Utilisez la carte et la recherche pour explorer en détail.
        </p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button icon={<MapPin className="h-5 w-5" />} onClick={() => go('/map')}>
            {t('common.seeOnMap')}
          </Button>
          <Button variant="secondary" onClick={() => go('/dashboard')}>
            {t('nav.home')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-6 lg:px-8 lg:py-10">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-hec-500" />
        <h1 className="font-display text-2xl font-bold text-hec-950">
          {t('tour.title')}
        </h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">{t('tour.subtitle')}</p>

      {/* Progress dots */}
      <div className="mt-6 flex gap-1.5">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? 'bg-hec-500' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-slate-100 bg-white p-6">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-hec-50 text-hec-600">
          <current.icon className="h-7 w-7" />
        </div>
        <h2 className="mt-4 font-display text-xl font-bold text-hec-950">
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {current.desc}
        </p>

        {loc && (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t('common.location')}
            </p>
            <p className="mt-1 font-semibold text-hec-950">{loc.name}</p>
            {loc.building && (
              <p className="text-sm text-slate-500">
                {loc.building.name.split('—')[0].trim()}
                {loc.floor ? ` · ${loc.floor.name}` : ''}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? go('/dashboard') : setStep((s) => s - 1))}
        >
          {step === 0 ? t('common.back') : t('tour.prev')}
        </Button>
        <div className="flex gap-2">
          {loc && (
            <Button
              variant="secondary"
              icon={<Navigation className="h-4 w-4" />}
              onClick={() => go('/map', { loc: loc.id })}
            >
              {t('common.guide')}
            </Button>
          )}
          {isLast ? (
            <Button
              icon={<CheckCircle className="h-4 w-4" />}
              onClick={() => setFinished(true)}
            >
              {t('tour.finish')}
            </Button>
          ) : (
            <Button
              icon={<ArrowRight className="h-4 w-4" />}
              onClick={() => setStep((s) => s + 1)}
            >
              {t('tour.next')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
