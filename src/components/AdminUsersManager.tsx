import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button, Badge, EmptyState, Spinner } from '@/components/ui';
import type { Profile, Role } from '@/lib/types';

type BadgeColor = 'slate' | 'blue' | 'green' | 'amber' | 'red';

const roleBadgeColor: Record<Role, BadgeColor> = {
  SUPER_ADMIN: 'red',
  ADMIN: 'blue',
  CAMPUS_MANAGER: 'green',
  STAFF: 'amber',
  TEACHER: 'amber',
  STUDENT: 'slate',
  VISITOR: 'slate',
};

/**
 * ÉTAPE 5/6/8 : liste (lecture seule) des utilisateurs et de leur rôle.
 *
 * Le changement de rôle reste volontairement fait depuis Supabase (Studio
 * ou script d'administration), conformément à l'ÉTAPE 6 et à la migration
 * `trg_restrict_self_signup_role` / `trg_prevent_role_self_escalation` :
 * un rôle privilégié ne doit jamais pouvoir être auto-attribué depuis
 * l'application. Cette vue sert à vérifier que le changement a bien été
 * pris en compte (rafraîchir après une modification côté Supabase).
 *
 * Nécessite la policy `admin_select_all_profiles` (migration
 * 20260826210000) pour voir autre chose que sa propre ligne.
 */
export function AdminUsersManager() {
  const [users, setUsers] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .order('role', { ascending: true })
      .order('full_name', { ascending: true });
    if (err) {
      setError(err.message);
      setUsers(null);
    } else {
      setUsers((data as Profile[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <Users className="h-4 w-4" />
          {users ? `${users.length} compte(s)` : 'Chargement…'}
        </p>
        <Button variant="secondary" size="sm" onClick={load} loading={loading}>
          <RefreshCw className="h-3.5 w-3.5" />
          Rafraîchir
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          Impossible de charger la liste des utilisateurs : {error}
          <br />
          Vérifiez que la policy RLS <code>admin_select_all_profiles</code>{' '}
          est bien appliquée sur <code>public.profiles</code>.
        </div>
      )}

      {!error && loading && !users && (
        <div className="mt-8 grid place-items-center">
          <Spinner label="Chargement des comptes…" />
        </div>
      )}

      {!error && users && users.length === 0 && (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="Aucun compte trouvé"
          description=""
        />
      )}

      {!error && users && users.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Nom</th>
                <th className="px-4 py-2.5">Rôle</th>
                <th className="px-4 py-2.5">ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5 font-medium text-hec-950">
                    {u.full_name || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge color={roleBadgeColor[u.role] ?? 'slate'}>
                      {u.role === 'SUPER_ADMIN' && (
                        <ShieldCheck className="h-3 w-3" />
                      )}
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                    {u.id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
