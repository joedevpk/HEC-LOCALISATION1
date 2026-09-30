import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { HERO_INTERVAL_MS, HERO_SLIDES } from '@/lib/hec-images';

/** Pause après une interaction (clic, swipe) avant reprise automatique. */
const RESUME_AFTER_MS = 8000;
const SWIPE_THRESHOLD_PX = 45;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * Hero plein écran : slideshow des 7 photos HEC (3 s par image, boucle
 * infinie, fondu + léger zoom). Seules l'image active et la suivante sont
 * chargées ; les autres le sont au fil du défilement. Un fond HEC (dégradé
 * bleu nuit) reste visible tant qu'une photo n'est pas prête : jamais d'écran
 * blanc. `children` = contenu fixe du hero (titre, boutons, recherche).
 */
export function HeroSlideshow({ children }: { children: ReactNode }) {
  const total = HERO_SLIDES.length;
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [holding, setHolding] = useState(false); // pause temporaire (interaction)
  const [userPaused, setUserPaused] = useState(false); // bouton pause explicite
  const [mounted, setMounted] = useState<number[]>([0, 1]);
  const loadedRef = useRef<Set<number>>(new Set());
  const [loadedTick, setLoadedTick] = useState(0);
  const resumeTimer = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  // Réduction des animations : pas de défilement automatique (contrôles manuels).
  const autoplay = !reduced && !userPaused && !holding;

  const markLoaded = useCallback((i: number) => {
    loadedRef.current.add(i);
    setLoadedTick((n) => n + 1);
  }, []);

  // Précharge progressivement : image active + suivante (+ précédente pour
  // le bouton « précédent »), montées une fois puis conservées.
  useEffect(() => {
    const next = (active + 1) % total;
    setMounted((prev) => (prev.includes(active) && prev.includes(next) ? prev : Array.from(new Set([...prev, active, next]))));
  }, [active, total]);

  const goTo = useCallback(
    (index: number) => {
      const i = ((index % total) + total) % total;
      setMounted((prev) => (prev.includes(i) ? prev : [...prev, i]));
      setActive(i);
    },
    [total],
  );

  // Défilement automatique : 3 s ; on attend que l'image suivante soit prête.
  useEffect(() => {
    if (!autoplay) return;
    const next = (active + 1) % total;
    const id = window.setTimeout(() => {
      if (loadedRef.current.has(next)) goTo(next);
      else setLoadedTick((n) => n + 1); // ré-évalue quand l'image arrive
    }, HERO_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [active, autoplay, total, goTo, loadedTick]);

  const interact = useCallback(() => {
    setHolding(true);
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setHolding(false), RESUME_AFTER_MS);
  }, []);

  useEffect(
    () => () => {
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    },
    [],
  );

  const manual = (index: number) => {
    interact();
    goTo(index);
  };

  const slide = HERO_SLIDES[active];

  return (
    <section
      aria-roledescription="carrousel"
      aria-label="Photos du campus HEC Kinshasa"
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,_rgba(30,94,255,0.35),_transparent_60%),linear-gradient(180deg,_#111d47_0%,_#152c72_100%)] text-white"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null) return;
        const dx = end - start;
        if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
        manual(dx < 0 ? active + 1 : active - 1);
      }}
    >
      {/* Couches photo : seules les images déjà « montées » existent dans le DOM. */}
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {mounted.map((i) => {
          const s = HERO_SLIDES[i];
          const isActive = i === active;
          return (
            <div key={s.photo.id} className="hero-slide" data-active={isActive} data-loaded={loadedRef.current.has(i)}>
              <img
                src={s.photo.src}
                srcSet={`${s.photo.small} 480w, ${s.photo.src} ${s.photo.width}w`}
                sizes="100vw"
                width={s.photo.width}
                height={s.photo.height}
                alt=""
                decoding="async"
                loading={i === 0 ? 'eager' : 'lazy'}
                {...(i === 0 ? ({ fetchpriority: 'high' } as Record<string, string>) : {})}
                onLoad={() => markLoaded(i)}
                style={{ objectPosition: s.photo.position }}
                className="h-full w-full object-cover"
              />
            </div>
          );
        })}
        {/* Voile bleu nuit : garde le texte lisible sur toutes les photos. */}
        <div className="absolute inset-0 bg-gradient-to-b from-hec-950/80 via-hec-950/45 to-hec-950/90" />
        <div className="absolute inset-0 bg-gradient-to-r from-hec-950/70 via-transparent to-transparent" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-5 pb-40 pt-28 sm:pb-36 lg:px-8 lg:pt-32">
        {children}
      </div>

      {/* Légende associée à la photo active + indicateurs + contrôles. */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:pb-8">
          <div key={active} className="hero-caption max-w-xl" aria-live="off">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-hec-200">{slide.label}</p>
            <p className="mt-1 font-display text-xl font-bold text-white sm:text-2xl">{slide.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-white/80">{slide.description}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex flex-1 items-center gap-1.5 lg:flex-none" role="tablist" aria-label="Choisir une photo">
              {HERO_SLIDES.map((s, i) => (
                <button
                  key={s.photo.id}
                  role="tab"
                  aria-selected={i === active}
                  aria-label={`Photo ${i + 1} sur ${total} : ${s.title}`}
                  onClick={() => manual(i)}
                  className="group flex h-11 flex-1 items-center focus:outline-none lg:w-9 lg:flex-none"
                >
                  <span className="relative block h-1 w-full overflow-hidden rounded-full bg-white/30 group-focus-visible:ring-2 group-focus-visible:ring-white">
                    <span
                      key={`${i === active}-${active}`}
                      className="absolute inset-y-0 left-0 block w-full origin-left rounded-full bg-white"
                      style={
                        i === active
                          ? autoplay
                            ? { animation: `hero-progress ${HERO_INTERVAL_MS}ms linear forwards` }
                            : { transform: 'scaleX(1)' }
                          : { transform: i < active ? 'scaleX(1)' : 'scaleX(0)', opacity: i < active ? 0.55 : 1 }
                      }
                    />
                  </span>
                </button>
              ))}
            </div>
            <span className="hidden font-display text-sm font-bold tabular-nums text-white/80 sm:block" aria-hidden="true">
              {String(active + 1).padStart(2, '0')}
              <span className="text-white/40"> / {String(total).padStart(2, '0')}</span>
            </span>
            <div className="hidden items-center gap-1.5 md:flex">
              <button
                onClick={() => manual(active - 1)}
                aria-label="Photo précédente"
                className="grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                onClick={() => setUserPaused((v) => !v)}
                aria-label={userPaused ? 'Reprendre le défilement' : 'Mettre en pause le défilement'}
                aria-pressed={userPaused}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
              >
                {userPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
              </button>
              <button
                onClick={() => manual(active + 1)}
                aria-label="Photo suivante"
                className="grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
