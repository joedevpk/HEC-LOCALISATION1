import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { homeRouteForRole } from '@/lib/roles';
import type { Profile, Role } from '@/lib/types';

// Set right before redirecting to an OAuth provider so that, once the
// provider sends the user back and a session appears, we know to route
// them to the right home page (there is no in-app form step to do it from).
const OAUTH_PENDING_KEY = 'hec_oauth_pending';

export type OAuthProvider = 'google' | 'github';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  /** Session Supabase en cours de résolution (tout premier chargement). */
  loading: boolean;
  /**
   * Une session existe mais le profil (donc le rôle) n'est pas encore
   * chargé depuis `public.profiles`. Tant que c'est `true`, aucune décision
   * basée sur `profile.role` (redirection, protection de route, menu admin)
   * ne doit être prise — cf. ÉTAPE 3 du cahier des charges.
   */
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<Role | null>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: Role,
  ) => Promise<Role | null>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
  /** Recharge le profil (et donc le rôle) depuis Supabase sans nécessiter
   * une déconnexion/reconnexion (ÉTAPE 2 du cahier des charges : un
   * changement de rôle fait dans Supabase doit se refléter après un
   * simple refresh du profil, un retour sur l'onglet, ou un rechargement
   * de page). Ne lève jamais : les erreurs sont journalisées et le profil
   * en mémoire est conservé plutôt que silencieusement effacé. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[Auth] Échec du chargement du profil :', error.message);
    return null;
  }
  return (data as Profile) ?? null;
}

function extractFullName(session: Session): string {
  const meta = session.user.user_metadata ?? {};
  return (
    (meta.full_name as string) ||
    (meta.name as string) ||
    (meta.user_name as string) ||
    (session.user.email ? session.user.email.split('@')[0] : '') ||
    ''
  );
}

function extractAvatarUrl(session: Session): string | null {
  return (
    (session.user.user_metadata?.avatar_url as string) ||
    (session.user.user_metadata?.picture as string) ||
    null
  );
}

/**
 * Ensures a profile row exists for the signed-in user. Used after OAuth
 * sign-in (Google/GitHub), where there is no explicit sign-up step to
 * create the row. Never overwrites an existing profile's data (in
 * particular, never touches `role`).
 */
async function ensureProfile(session: Session): Promise<Profile | null> {
  const existing = await loadProfile(session.user.id);
  if (existing) return existing;

  const fullName = extractFullName(session);
  const avatarUrl = extractAvatarUrl(session);

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: session.user.id,
      full_name: fullName,
      role: 'STUDENT',
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    })
    .select('*')
    .maybeSingle();

  if (error) {
    // Another tab/request may have created it concurrently, or the
    // optional avatar_url column may not exist — fall back to a plain
    // read so sign-in doesn't get blocked by a non-critical insert error.
    return loadProfile(session.user.id);
  }

  return (data as Profile) ?? null;
}

/**
 * If we just came back from an OAuth provider (Google/GitHub), route the
 * now-authenticated user to their role-appropriate home (ÉTAPE 3), as
 * there was no in-app form submit to do it from. No-op for ordinary
 * email/password sign-ins, which handle their own navigation.
 */
function completePendingOAuthRedirect(
  session: Session | null,
  profile: Profile | null,
) {
  if (!session) return;
  if (typeof window === 'undefined') return;
  if (!window.sessionStorage.getItem(OAUTH_PENDING_KEY)) return;
  window.sessionStorage.removeItem(OAUTH_PENDING_KEY);
  navigate(homeRouteForRole(profile?.role));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  // Miroir de `profile` accessible depuis le listener onAuthStateChange
  // ci-dessous, qui est créé une seule fois (deps `[]`) et ne doit donc
  // jamais lire `profile` via une closure figée sur sa valeur de départ.
  const profileRef = useRef<Profile | null>(null);
  profileRef.current = profile;

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) {
        setProfileLoading(true);
        ensureProfile(data.session).then((p) => {
          if (!active) return;
          setProfile(p);
          setProfileLoading(false);
          completePendingOAuthRedirect(data.session, p);
        });
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) {
        // Le client Supabase déclenche cet événement bien plus souvent
        // qu'à la connexion : notamment à chaque rafraîchissement
        // automatique du token, lui-même déclenché quand l'onglet regagne
        // le focus. Si le profil de ce même utilisateur est déjà en
        // mémoire, ce n'est pas une vraie connexion — on rafraîchit
        // tranquillement en arrière-plan (comme l'effet focus/visibilité
        // ci-dessous) SANS repasser `profileLoading` à `true`, sinon
        // App.tsx réaffiche l'écran plein "Chargement du profil…" et vide
        // toute l'appli à chaque retour d'onglet. Seul un vrai changement
        // d'utilisateur (connexion, bascule de compte) doit encore bloquer
        // l'affichage le temps de charger son profil.
        if (profileRef.current?.id === next.user.id) {
          loadProfile(next.user.id).then((fresh) => {
            if (active && fresh) setProfile(fresh);
          });
        } else {
          setProfileLoading(true);
          ensureProfile(next).then((p) => {
            if (!active) return;
            setProfile(p);
            setProfileLoading(false);
            completePendingOAuthRedirect(next, p);
          });
        }
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (
    email: string,
    password: string,
  ): Promise<Role | null> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (!data.session) return null;
    // Charger le profil ici (en plus du listener onAuthStateChange, qui
    // fera la même chose de façon idempotente) permet de connaître le rôle
    // immédiatement pour rediriger correctement (ÉTAPE 3), sans attendre
    // un cycle de re-render supplémentaire.
    setProfileLoading(true);
    const p = await ensureProfile(data.session);
    setSession(data.session);
    setProfile(p);
    setProfileLoading(false);
    return p?.role ?? null;
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: Role,
  ): Promise<Role | null> => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        full_name: fullName,
        role,
      });
      if (profileError) throw profileError;
      const newProfile: Profile = {
        id: data.user.id,
        full_name: fullName,
        role,
        created_at: new Date().toISOString(),
      };
      setProfile(newProfile);
      return newProfile.role;
    }
    return null;
  };

  const signInWithOAuth = async (provider: OAuthProvider) => {
    window.sessionStorage.setItem(OAUTH_PENDING_KEY, '1');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    });
    if (error) {
      window.sessionStorage.removeItem(OAUTH_PENDING_KEY);
      throw error;
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (!session) return;
    try {
      const fresh = await loadProfile(session.user.id);
      // On ne remplace le profil en mémoire que si le rechargement a
      // réussi : une erreur réseau ponctuelle ne doit jamais effacer un
      // rôle déjà connu (ÉTAPE 2 : "ne jamais conserver indéfiniment un
      // ancien rôle" ne veut pas dire "l'effacer au moindre souci réseau").
      if (fresh) setProfile(fresh);
    } catch (err) {
      console.error('[Auth] refreshProfile a échoué :', err);
    }
  };

  // Un profil (donc un rôle) modifié côté Supabase pendant que l'onglet est
  // resté ouvert doit être repris sans forcer une reconnexion : on
  // rafraîchit automatiquement quand l'utilisateur revient sur l'onglet
  // (focus fenêtre, ou visibilité de l'onglet sur mobile).
  useEffect(() => {
    if (!session) return;
    const reload = () => {
      loadProfile(session.user.id).then((fresh) => {
        if (fresh) setProfile(fresh);
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') reload();
    };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [session]);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        profileLoading,
        signIn,
        signUp,
        signInWithOAuth,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
