import {
  Accessibility,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  Navigation,
  Share2,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BuildingImage, CampusLocation, LocationImage } from '@/lib/types';
import { categoryLabel, locationIcon } from '@/lib/display';
import { Button } from '@/components/ui';
import { getBuildingImages, getLocationImages } from '@/lib/api';

/**
 * Galerie photo du panneau de détail : affiche TOUTES les photos de la
 * salle (`location_images`), pas seulement la principale. Si la salle
 * n'a aucune photo à elle, on retombe sur la galerie complète de son
 * bâtiment plutôt que sur sa seule photo principale — même logique de
 * repli que `primary_image_url ?? building.primary_image_url`, mais
 * appliquée à la galerie entière.
 */
function useLocationGallery(location: CampusLocation) {
  const [images, setImages] = useState<(LocationImage | BuildingImage)[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const own = await getLocationImages(location.id);
        if (cancelled) return;
        if (own.length > 0) {
          setImages(own);
          return;
        }
        if (location.building?.id) {
          const buildingImages = await getBuildingImages(location.building.id);
          if (!cancelled) setImages(buildingImages);
        } else {
          setImages([]);
        }
      } catch {
        // Repli silencieux sur la photo principale déjà présente sur
        // `location` (ancien comportement) si la galerie ne charge pas.
        if (!cancelled) setImages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.id, location.building?.id]);

  return { images, loading };
}

function LocationGallery({ location }: { location: CampusLocation }) {
  const { images, loading } = useLocationGallery(location);
  const [index, setIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIndex(0);
    scrollerRef.current?.scrollTo({ left: 0 });
  }, [location.id]);

  const fallbackUrl = location.primary_image_url ?? location.building?.primary_image_url ?? null;

  // Pendant le chargement (ou en cas d'échec sans repli), on garde
  // l'ancien comportement une-seule-photo pour ne rien casser.
  if (!loading && images.length === 0) {
    if (!fallbackUrl) return null;
    return (
      <img
        src={fallbackUrl}
        alt={location.name}
        className="mb-4 h-40 w-full rounded-2xl object-cover"
      />
    );
  }

  if (images.length === 0) {
    return (
      <div className="mb-4 h-40 w-full animate-pulse rounded-2xl bg-slate-100 dark:bg-hec-800" />
    );
  }

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(images.length - 1, next));
    setIndex(clamped);
    const el = scrollerRef.current;
    if (el) el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
  };

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="relative mb-4">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex h-40 w-full snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((img, i) => (
          <img
            key={img.id}
            src={img.public_url}
            alt={'caption' in img && img.caption ? img.caption : `${location.name} — photo ${i + 1}`}
            className="h-40 w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>

      {images.length > 1 && (
        <>
          <button
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label="Photo précédente"
            className="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-opacity disabled:opacity-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => goTo(index + 1)}
            disabled={index === images.length - 1}
            aria-label="Photo suivante"
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-opacity disabled:opacity-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {images.map((img, i) => (
              <button
                key={img.id}
                onClick={() => goTo(i)}
                aria-label={`Aller à la photo ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                }`}
              />
            ))}
          </div>
          <span className="absolute right-2 top-2 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {index + 1}/{images.length}
          </span>
        </>
      )}
    </div>
  );
}

export function LocationDetail({
  location,
  isFavorite,
  canFavorite,
  onToggleFavorite,
  onNavigate,
  onClose,
}: {
  location: CampusLocation;
  isFavorite: boolean;
  canFavorite: boolean;
  onToggleFavorite: () => void;
  onNavigate: () => void;
  onClose: () => void;
}) {
  const Icon = locationIcon(location);
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/map?loc=${location.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: location.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* dismissed */
    }
  };

  return (
    <div className="animate-fade-up">
      <LocationGallery location={location} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white"
            style={{ background: location.building?.color ?? '#1e5eff' }}
          >
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-hec-500">
              {categoryLabel(location)}
            </p>
            <h2 className="font-display text-xl font-bold text-hec-950 dark:text-white">
              {location.name}
            </h2>
          </div>
        </div>
        <button
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-hec-800 dark:hover:text-slate-300"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {location.description && (
        <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {location.description}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2.5">
        {location.building && (
          <Info label="Bâtiment" value={location.building.name.split('—')[0].trim()} />
        )}
        {location.floor && <Info label="Étage" value={location.floor.name} />}
        {location.code && <Info label="Code" value={location.code} />}
        {location.capacity != null && (
          <Info
            label="Capacité"
            value={`${location.capacity} places`}
            icon={<Users className="h-3.5 w-3.5" />}
          />
        )}
      </dl>

      {location.is_accessible && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <Accessibility className="h-4 w-4" />
          Accès facilité pour les personnes à mobilité réduite
        </div>
      )}

      <div className="mt-5 flex items-center gap-2">
        <Button
          size="lg"
          className="flex-1"
          icon={<Navigation className="h-5 w-5" />}
          onClick={onNavigate}
        >
          Me guider
        </Button>
        {canFavorite && (
          <button
            onClick={onToggleFavorite}
            aria-label="Favori"
            className={`grid h-13 w-13 place-items-center rounded-2xl border py-3.5 transition-colors ${
              isFavorite
                ? 'border-red-100 bg-red-50 text-red-500 dark:border-red-900/50 dark:bg-red-950/40'
                : 'border-slate-200 bg-white text-slate-400 hover:border-red-200 hover:text-red-500 dark:border-hec-800 dark:bg-hec-900 dark:text-slate-500'
            }`}
          >
            <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        )}
        <button
          onClick={share}
          aria-label="Partager"
          className="grid h-13 w-13 place-items-center rounded-2xl border border-slate-200 bg-white py-3.5 text-slate-400 transition-colors hover:border-hec-200 hover:text-hec-500 dark:border-hec-800 dark:bg-hec-900 dark:text-slate-500"
        >
          {copied ? (
            <Check className="h-5 w-5 text-emerald-500" />
          ) : (
            <Share2 className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-hec-800 dark:bg-hec-800/40">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-hec-950 dark:text-white">
        {icon}
        {value}
      </dd>
    </div>
  );
}