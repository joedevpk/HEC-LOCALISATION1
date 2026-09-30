import { useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Loader2, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { Button, Logo } from '@/components/ui';
import { useNavigate } from '@/lib/router';
import { useAuth, type OAuthProvider } from '@/context/AuthContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { homeRouteForRole } from '@/lib/roles';
import type { Role } from '@/lib/types';
import { HEC_PHOTOS } from '@/lib/hec-images';

const oauthErrorMessages: Record<string, string> = {
  access_denied: 'Connexion annulée.',
  server_error: 'Le fournisseur de connexion est momentanément indisponible.',
  temporarily_unavailable:
    'Le fournisseur de connexion est momentanément indisponible.',
};

function oauthErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  const lower = message.toLowerCase();
  if (lower.includes('provider is not enabled')) {
    return 'Cette méthode de connexion n\'est pas encore activée.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Problème de connexion réseau. Réessayez.';
  }
  for (const [code, friendly] of Object.entries(oauthErrorMessages)) {
    if (lower.includes(code)) return friendly;
  }
  return message || 'La connexion a échoué. Réessayez.';
}

const roles: { value: Role; label: string }[] = [
  { value: 'STUDENT', label: 'Étudiant' },
  { value: 'TEACHER', label: 'Enseignant' },
  { value: 'STAFF', label: 'Personnel' },
  { value: 'VISITOR', label: 'Visiteur' },
];

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const go = useNavigate();
  const { signIn, signUp, signInWithOAuth } = useAuth();
  const isRegister = mode === 'register';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Consentement obligatoire à l'inscription : JAMAIS pré-coché.
  const [accepted, setAccepted] = useState(false);
  const consentMissing = isRegister && !accepted;
  // Verrou synchrone : deux Entrée/clics rapprochés arrivent avant que
  // React ait re-rendu le bouton désactivé — l'état `loading` seul ne
  // suffit donc pas à empêcher un double envoi.
  const submittingRef = useRef(false);
  const [role, setRole] = useState<Role>('STUDENT');
  const [error, setError] = useState<string | null>(() => {
    // Providers (Google/GitHub) redirect back with #error=...&error_description=...
    // when the user cancels or the provider fails — surface that here.
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(
      hash.includes('error') ? hash : hash.split('?')[1] || '',
    );
    const errCode = params.get('error');
    if (!errCode) return null;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return (
      oauthErrorMessages[errCode] ||
      params.get('error_description')?.replace(/\+/g, ' ') ||
      'La connexion a échoué. Réessayez.'
    );
  });
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);

  const submitOAuth = async (provider: OAuthProvider) => {
    if (submittingRef.current) return;
    if (consentMissing) {
      setError("Veuillez accepter les Conditions d'utilisation et la Politique de confidentialité pour créer un compte.");
      return;
    }
    submittingRef.current = true;
    setError(null);
    setOauthLoading(provider);
    try {
      await signInWithOAuth(provider);
      // On success the browser navigates away to the provider; no further
      // action needed here. On failure we fall through to the catch below.
    } catch (err) {
      setError(oauthErrorMessage(err));
      setOauthLoading(null);
      submittingRef.current = false;
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (consentMissing) {
      setError("Veuillez accepter les Conditions d'utilisation et la Politique de confidentialité pour créer un compte.");
      return;
    }
    if (isRegister && password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    submittingRef.current = true;
    setError(null);
    setLoading(true);
    try {
      // ÉTAPE 3 : rediriger selon le rôle réellement chargé, pas toujours
      // vers la page d'accueil / le dashboard étudiant.
      const resultingRole = isRegister
        ? await signUp(email, password, fullName, role)
        : await signIn(email, password);
      go(homeRouteForRole(resultingRole));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Une erreur est survenue.',
      );
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-hec-50/40 dark:from-hec-950 dark:via-hec-950 dark:to-hec-900">
      {/* Panneau visuel (desktop) : vraie photo du campus HEC + voile bleu. */}
      <aside className="relative hidden w-[45%] max-w-[640px] overflow-hidden bg-hec-950 lg:block" aria-hidden="true">
        <img
          src={HEC_PHOTOS.buildingPalms.src}
          srcSet={`${HEC_PHOTOS.buildingPalms.small} 480w, ${HEC_PHOTOS.buildingPalms.src} 810w`}
          sizes="45vw"
          alt=""
          decoding="async"
          style={{ objectPosition: HEC_PHOTOS.buildingPalms.position }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-hec-950/95 via-hec-950/55 to-hec-950/30" />
        <div className="absolute inset-x-0 bottom-0 p-10 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-hec-200">Haute École de Commerce de Kinshasa</p>
          <p className="mt-2 font-display text-3xl font-extrabold">Bienvenue à HEC Localisation</p>
          <p className="mt-2 max-w-sm text-white/80">Le campus HEC, à portée de carte.</p>
        </div>
      </aside>
      <div className="flex flex-1 items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="relative mb-5 h-28 overflow-hidden rounded-3xl bg-hec-950 lg:hidden" aria-hidden="true">
          <img
            src={HEC_PHOTOS.buildingPalms.small}
            alt=""
            decoding="async"
            style={{ objectPosition: 'center 40%' }}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-hec-950/90 to-hec-950/30" />
          <p className="absolute bottom-3 left-4 font-display text-lg font-extrabold text-white">Bienvenue à HEC Localisation</p>
        </div>
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => go('/')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-hec-600 dark:text-slate-400 dark:hover:text-hec-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à l'accueil
          </button>
          <LanguageSwitcher compact />
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-panel sm:p-9 dark:border-hec-800 dark:bg-hec-900">
          <div className="flex flex-col items-center text-center">
            <Logo size="lg" />
            <h1 className="mt-6 font-display text-2xl font-bold text-hec-950 dark:text-white">
              {isRegister ? 'Créer un compte' : 'Connexion'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {isRegister
                ? 'Enregistrez-vous pour sauvegarder vos favoris et votre historique.'
                : 'Accédez à votre espace personnel HEC.'}
            </p>
          </div>

          {isRegister && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-hec-800 dark:bg-hec-950/40">
              <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  aria-describedby="consent-help"
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-hec-600 focus:ring-2 focus:ring-hec-500"
                />
                <span className="text-sm leading-snug text-slate-600 dark:text-slate-300">
                  J'accepte les{' '}
                  <a href="#/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-hec-600 underline">
                    Conditions d'utilisation
                  </a>{' '}
                  et j'ai pris connaissance de la{' '}
                  <a href="#/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-hec-600 underline">
                    Politique de confidentialité
                  </a>
                  .
                </span>
              </label>
              <p id="consent-help" className="mt-1 pl-8 text-xs text-slate-500 dark:text-slate-400">
                Requis pour créer un compte (e-mail, Google ou GitHub). Les liens s'ouvrent dans un nouvel onglet : votre saisie est conservée.
              </p>
            </div>
          )}

          <div className="mt-7 space-y-2.5">
            <button
              type="button"
              onClick={() => submitOAuth('google')}
              disabled={oauthLoading !== null || loading || consentMissing}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-hec-950 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none dark:border-hec-800 dark:bg-hec-900 dark:text-white dark:hover:border-hec-700 dark:hover:bg-hec-800"
            >
              {oauthLoading === 'google' ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-slate-500" />
              ) : (
                <GoogleIcon className="h-4 w-4" />
              )}
              {oauthLoading === 'google' ? 'Connexion à Google…' : 'Continuer avec Google'}
            </button>
            <button
              type="button"
              onClick={() => submitOAuth('github')}
              disabled={oauthLoading !== null || loading || consentMissing}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-hec-950 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none dark:border-hec-800 dark:bg-hec-900 dark:text-white dark:hover:border-hec-700 dark:hover:bg-hec-800"
            >
              {oauthLoading === 'github' ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-slate-500" />
              ) : (
                <GitHubIcon className="h-4 w-4" />
              )}
              {oauthLoading === 'github' ? 'Connexion à GitHub…' : 'Continuer avec GitHub'}
            </button>
          </div>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-100 dark:bg-hec-800" />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              ou
            </span>
            <div className="h-px flex-1 bg-slate-100 dark:bg-hec-800" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            {isRegister && (
              <Field
                icon={<User className="h-4 w-4" />}
                label="Nom complet"
                type="text"
                value={fullName}
                onChange={setFullName}
                placeholder="Jean Mukendi"
                required
              />
            )}
            <Field
              icon={<Mail className="h-4 w-4" />}
              label="Adresse e-mail"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="vous@exemple.com"
              required
            />
            <Field
              icon={<Lock className="h-4 w-4" />}
              label="Mot de passe"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              required
              minLength={6}
            />
            {isRegister && (
              <Field
                icon={<Lock className="h-4 w-4" />}
                label="Confirmer le mot de passe"
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="••••••••"
                required
                minLength={6}
              />
            )}

            {isRegister && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Profil
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {roles.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRole(r.value)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                        role === r.value
                          ? 'border-hec-400 bg-hec-50 text-hec-700 dark:border-hec-500 dark:bg-hec-800 dark:text-hec-300'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-hec-800 dark:bg-hec-900 dark:text-slate-300 dark:hover:border-hec-700'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={loading}
              disabled={consentMissing}
            >
              {isRegister ? 'Créer mon compte' : 'Se connecter'}
            </Button>
            {!isRegister && (
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                En vous connectant, vous acceptez les{' '}
                <a href="#/terms" target="_blank" rel="noopener noreferrer" className="font-medium underline">Conditions d'utilisation</a>{' '}
                et la{' '}
                <a href="#/privacy" target="_blank" rel="noopener noreferrer" className="font-medium underline">Politique de confidentialité</a>.
              </p>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {isRegister ? (
              <>
                Déjà un compte ?{' '}
                <button
                  onClick={() => go('/login')}
                  className="font-semibold text-hec-600 hover:text-hec-700 dark:text-hec-400 dark:hover:text-hec-300"
                >
                  Se connecter
                </button>
              </>
            ) : (
              <>
                Pas encore de compte ?{' '}
                <button
                  onClick={() => go('/register')}
                  className="font-semibold text-hec-600 hover:text-hec-700 dark:text-hec-400 dark:hover:text-hec-300"
                >
                  Créer un compte
                </button>
              </>
            )}
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.44H12v4.62h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11C3.24 21.3 7.29 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.9 12c0-.8.14-1.57.37-2.29V6.6H1.26A11.98 11.98 0 0 0 0 12c0 1.94.47 3.77 1.26 5.4l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.29 0 3.24 2.7 1.26 6.6l4.01 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.79-.25.79-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.69-1.28-1.69-1.04-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.77.12 3.06.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14 0 1.54-.01 2.79-.01 3.17 0 .3.21.66.8.55A10.51 10.51 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5Z" />
    </svg>
  );
}

function Field({
  icon,
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  minLength,
}: {
  icon: React.ReactNode;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
}) {
  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
          {icon}
        </span>
        <input
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          className={`w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 text-sm font-medium text-hec-950 placeholder:text-slate-400 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100 dark:border-hec-800 dark:bg-hec-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-hec-500 dark:focus:ring-hec-900 ${
            isPassword ? 'pr-11' : 'pr-3.5'
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-300 dark:text-slate-500 dark:hover:bg-hec-800 dark:hover:text-slate-300"
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </label>
  );
}
