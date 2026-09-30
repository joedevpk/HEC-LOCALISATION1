import { useState } from 'react';
import { Compass, MapPinned, Search, X } from 'lucide-react';
import { Button } from '@/components/ui';

const screens = [
  {
    icon: MapPinned,
    title: 'Découvrez le campus',
    desc: "Explorez le campus HEC Kinshasa sur une carte interactive, bâtiment par bâtiment.",
  },
  {
    icon: Search,
    title: 'Trouvez facilement vos destinations',
    desc: 'Recherchez une salle, un bureau ou un service en quelques secondes.',
  },
  {
    icon: Compass,
    title: 'Laissez-vous guider',
    desc: 'Lancez un itinéraire pas à pas jusqu\'à votre destination.',
  },
];

export function OnboardingModal({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === screens.length - 1;
  const screen = screens[step];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-5 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-panel dark:bg-hec-900">
        <button
          onClick={onDone}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-hec-800"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="mt-2 text-sm font-semibold text-hec-500">
          Bienvenue sur HEC Localisation
        </p>

        <div className="mx-auto mt-6 grid h-20 w-20 place-items-center rounded-3xl bg-hec-50 text-hec-600 dark:bg-hec-800">
          <screen.icon className="h-9 w-9" />
        </div>
        <h2 className="mt-5 font-display text-xl font-bold text-hec-950 dark:text-white">
          {screen.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {screen.desc}
        </p>

        <div className="mt-6 flex items-center justify-center gap-1.5">
          {screens.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-6 bg-hec-500' : 'w-1.5 bg-slate-200 dark:bg-hec-700'
              }`}
            />
          ))}
        </div>

        <Button
          className="mt-6 w-full"
          onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
        >
          {isLast ? 'Commencer' : 'Suivant'}
        </Button>
      </div>
    </div>
  );
}
