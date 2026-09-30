import { Compass, Home, MapPinned } from 'lucide-react';
import { useNavigate } from '@/lib/router';
import { Button } from '@/components/ui';

export function NotFoundPage() {
  const go = useNavigate();

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-20 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-3xl bg-hec-50 text-hec-600">
        <Compass className="h-8 w-8" />
      </span>
      <p className="mt-6 font-display text-5xl font-extrabold text-hec-950">
        404
      </p>
      <h1 className="mt-2 font-display text-xl font-bold text-hec-950">
        Page introuvable
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Cette page n'existe pas ou a été déplacée. Vous pouvez toujours
        revenir à l'accueil ou ouvrir la carte du campus.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button icon={<Home className="h-4 w-4" />} onClick={() => go('/')}>
          Retour à l'accueil
        </Button>
        <Button
          variant="secondary"
          icon={<MapPinned className="h-4 w-4" />}
          onClick={() => go('/map')}
        >
          Ouvrir la carte
        </Button>
      </div>
    </div>
  );
}
