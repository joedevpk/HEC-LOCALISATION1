import { useEffect, useState, type ReactNode } from 'react';
import { Building2 } from 'lucide-react';

interface CampusImageProps {
  /** Sources par ordre de priorité : la première qui charge est utilisée
   * (ex. photo fournie par l'administration dans /images/campus/, puis
   * photo réelle déjà stockée dans Supabase). Les valeurs vides sont
   * ignorées. Aucune image n'est JAMAIS fabriquée. */
  sources: Array<string | null | undefined>;
  /** Texte alternatif (obligatoire : accessibilité). */
  alt: string;
  className?: string;
  imgClassName?: string;
  /** Dimensions intrinsèques : évitent le saut de mise en page (CLS). */
  width?: number;
  height?: number;
  /** true pour l'image principale au-dessus de la ligne de flottaison
   * (chargement immédiat) ; sinon chargement paresseux. */
  priority?: boolean;
  /** Repli affiché quand AUCUNE source n'est disponible. */
  fallback?: ReactNode;
  objectPosition?: string;
}

/**
 * Image de campus responsive avec repli élégant (PHASE 3 / 11) :
 * lazy-loading, `decoding="async"`, dimensions, `alt`, esquisse animée
 * pendant le chargement, et bascule automatique sur la source suivante si
 * l'une échoue (404, hors-ligne) — la page ne casse jamais.
 */
export function CampusImage({
  sources,
  alt,
  className = '',
  imgClassName = '',
  width,
  height,
  priority = false,
  fallback,
  objectPosition = 'center',
}: CampusImageProps) {
  const list = sources.filter((s): s is string => typeof s === 'string' && s.trim() !== '');
  const key = list.join('|');
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setIndex(0);
    setLoaded(false);
  }, [key]);

  const src = list[index];

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {src ? (
        <>
          {!loaded && (
            <div
              aria-hidden="true"
              className="absolute inset-0 animate-pulse bg-hec-950/10 motion-reduce:animate-none"
            />
          )}
          <img
            key={src}
            src={src}
            alt={alt}
            width={width}
            height={height}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            // @ts-expect-error fetchpriority est valide en HTML mais absent des types React 18
            fetchpriority={priority ? 'high' : 'auto'}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setLoaded(false);
              setIndex((i) => i + 1);
            }}
            style={{ objectPosition }}
            className={`h-full w-full object-cover transition-opacity duration-500 ${
              loaded ? 'opacity-100' : 'opacity-0'
            } ${imgClassName}`}
          />
        </>
      ) : (
        (fallback ?? <ImageFallback label={alt} />)
      )}
    </div>
  );
}

/** Repli premium : dégradé HEC + pictogramme. Ne prétend jamais être une photo. */
export function ImageFallback({ label }: { label?: string }) {
  return (
    <div
      role="img"
      aria-label={label ? `${label} (photo à venir)` : 'Photo à venir'}
      className="absolute inset-0 grid place-items-center bg-gradient-to-br from-hec-900 via-hec-800 to-hec-950"
    >
      <div className="text-center text-hec-200">
        <Building2 className="mx-auto h-8 w-8 opacity-70" aria-hidden="true" />
        <p className="mt-2 text-[11px] font-medium uppercase tracking-wider opacity-70">
          Photo à venir
        </p>
      </div>
    </div>
  );
}
