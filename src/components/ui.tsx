import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, Loader2, MapPin, RefreshCw } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'glass' | 'link';
type Size = 'sm' | 'md' | 'lg';
type BadgeColor = 'slate' | 'blue' | 'green' | 'amber' | 'red';

const variants: Record<Variant, string> = {
  primary:
    'bg-hec-500 text-white hover:bg-hec-600 shadow-glass focus-visible:ring-hec-300',
  secondary:
    'bg-white text-hec-950 border border-slate-200 hover:border-hec-300 hover:bg-hec-50 focus-visible:ring-hec-200',
  ghost:
    'bg-transparent text-hec-900 hover:bg-slate-100 focus-visible:ring-slate-200',
  dark: 'bg-hec-950 text-white hover:bg-hec-900 focus-visible:ring-hec-300',
  // Secondaire sur photo : verre dépoli blanc (hero, sections image).
  glass:
    'border border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20 focus-visible:ring-white/40',
  // Tertiaire : « En savoir plus ».
  link: 'bg-transparent px-2 text-hec-600 underline-offset-4 hover:underline focus-visible:ring-hec-200',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-xl gap-1.5 [@media(pointer:coarse)]:h-11',
  md: 'h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'min-h-[52px] px-6 text-base rounded-2xl gap-2.5 py-3.5',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading,
      icon,
      children,
      className = '',
      disabled,
      type = 'button', // ⚠️ voir note plus bas
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        aria-busy={loading || undefined}
        className={`inline-flex items-center justify-center font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-4 disabled:opacity-50 disabled:pointer-events-none hover:-translate-y-px active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          icon && (
            <span aria-hidden="true" className="inline-flex">
              {icon}
            </span>
          )
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export function Logo({
  size = 'md',
  inverted = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  inverted?: boolean;
}) {
  const box =
    size === 'lg' ? 'h-11 w-11' : size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const text =
    size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-sm' : 'text-base';
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`${box} grid place-items-center rounded-xl bg-hec-950 shadow-glass`}
      >
        <MapPin
          className="h-1/2 w-1/2 text-hec-400"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </div>
      <div className="leading-tight">
        <div
          className={`font-display font-extrabold ${text} ${
            inverted ? 'text-white' : 'text-hec-950'
          }`}
        >
          HEC <span className="text-hec-500">Localisation</span>
        </div>
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-6 w-6 animate-spin text-hec-500" aria-hidden="true" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function Badge({
  children,
  color = 'slate',
}: {
  children: ReactNode;
  color?: BadgeColor;
}) {
  const map: Record<BadgeColor, string> = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-hec-50 text-hec-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[color]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  /** Action utile (ex. bouton "Explorer la carte") — recommandée. */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
      <div
        className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"
        aria-hidden="true"
      >
        {icon}
      </div>
      <div>
        <p className="font-semibold text-hec-950">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/**
 * Bloc d'erreur standard (PHASE 6, règles 04/07) : message clair,
 * bouton [Réessayer], et détail technique uniquement si `technicalDetail`
 * est fourni (à réserver aux écrans d'administration).
 */
export function ErrorState({
  title = 'Une erreur est survenue.',
  description,
  onRetry,
  technicalDetail,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  technicalDetail?: string | null;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-100 bg-red-50/60 px-6 py-12 text-center"
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-red-100 text-red-600" aria-hidden="true">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <div>
        <p className="font-semibold text-red-900">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-red-700/80">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Réessayer
        </Button>
      )}
      {technicalDetail && (
        <details className="max-w-md text-left text-xs text-slate-500">
          <summary className="cursor-pointer select-none">Détail technique</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{technicalDetail}</pre>
        </details>
      )}
    </div>
  );
}

/** Esquisse de chargement (skeleton) : jamais d'écran blanc pendant une requête. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl bg-slate-200/70 motion-reduce:animate-none ${className}`}
    />
  );
}

/** Liste d'esquisses (résultats de recherche, cartes...). */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Chargement en cours" className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3">
          <Skeleton className="h-14 w-14 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
