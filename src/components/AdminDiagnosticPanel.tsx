import { useState } from 'react';
import { RefreshCw, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRoute } from '@/lib/router';
import { isAdminRole, isFullAdminRole, isSuperAdmin } from '@/lib/roles';
import { Button } from '@/components/ui';

/**
 * ÉTAPE 11 : zone de diagnostic temporaire, réservée aux administrateurs.
 *
 * Affiche exactement ce que React a reçu de Supabase — pas ce qui est
 * supposé être dans la base — pour repérer immédiatement si le rôle
 * SUPER_ADMIN n'a pas été correctement propagé jusqu'ici.
 *
 * Peut être retirée (ou limitée au mode développement) une fois le
 * problème résolu — voir le commentaire en fin de fichier.
 */
export function AdminDiagnosticPanel() {
  const { session, profile, refreshProfile } = useAuth();
  const route = useRoute();
  const [refreshing, setRefreshing] = useState(false);

  const doRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  const rows: { label: string; value: string }[] = [
    { label: 'Session ID', value: session?.access_token ? session.access_token.slice(0, 24) + '…' : '—' },
    { label: 'User ID (auth.users.id)', value: session?.user.id ?? '—' },
    { label: 'Email', value: session?.user.email ?? '—' },
    { label: 'Profile ID (profiles.id)', value: profile?.id ?? '—' },
    { label: 'Full name', value: profile?.full_name || '—' },
    { label: 'Role', value: profile?.role ?? '(aucun profil chargé)' },
    { label: 'Is admin (ADMIN/SUPER_ADMIN/CAMPUS_MANAGER)', value: String(isAdminRole(profile?.role)) },
    { label: 'Is full admin (ADMIN/SUPER_ADMIN)', value: String(isFullAdminRole(profile?.role)) },
    { label: 'Is SUPER_ADMIN', value: String(isSuperAdmin(profile?.role)) },
    { label: 'Current route', value: route.path },
  ];

  const roleLooksWrong = session && !profile;
  const idsMismatch = session && profile && session.user.id !== profile.id;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          {isSuperAdmin(profile?.role) ? (
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          ) : (
            <ShieldQuestion className="h-4 w-4 text-amber-500" />
          )}
          État réel côté React (pas Supabase Dashboard)
        </p>
        <Button variant="secondary" size="sm" onClick={doRefresh} loading={refreshing}>
          <RefreshCw className="h-3.5 w-3.5" />
          refreshProfile()
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="w-1/2 px-4 py-2.5 font-medium text-slate-500">
                  {r.label}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-hec-950 break-all">
                  {r.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {roleLooksWrong && (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Une session existe mais aucun profil n'a pu être chargé depuis
          <code className="mx-1">public.profiles</code>. Vérifiez qu'une ligne
          existe bien pour cet <code>id</code> (voir
          <code className="mx-1">supabase/diagnostics/check_main_super_admin.sql</code>)
          et que les policies RLS de lecture l'autorisent.
        </div>
      )}
      {idsMismatch && (
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          Le profil chargé n'a pas le même ID que l'utilisateur connecté —
          ceci ne devrait jamais arriver et indique un bug de chargement.
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Zone de diagnostic temporaire (ÉTAPE 11 du correctif SUPER_ADMIN).
        Vous pouvez retirer l'onglet « Diagnostic » dans AdminPage.tsx une
        fois le problème confirmé résolu, ou le conserver — il n'expose
        rien qu'un administrateur ne voie déjà via `isAdmin`.
      </p>
    </div>
  );
}
