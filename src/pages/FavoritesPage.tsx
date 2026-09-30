import { useMemo } from 'react';
import { Heart } from 'lucide-react';
import { useCampus } from '@/context/CampusContext';
import { useNavigate } from '@/lib/router';
import { LocationCard } from '@/components/LocationCard';
import { EmptyState } from '@/components/ui';

export function FavoritesPage() {
  const { locations, favorites } = useCampus();
  const go = useNavigate();

  const favs = useMemo(
    () => locations.filter((l) => favorites.has(l.id)),
    [locations, favorites],
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8 lg:py-10">
      <h1 className="font-display text-2xl font-bold text-hec-950">
        Mes favoris
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Vos lieux enregistrés pour un accès rapide.
      </p>

      {favs.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Heart className="h-5 w-5" />}
            title="Aucun favori"
            description="Ouvrez un lieu sur la carte et touchez le cœur pour l'enregistrer ici."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {favs.map((loc) => (
            <LocationCard
              key={loc.id}
              location={loc}
              onClick={() => go('/map', { loc: loc.id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
