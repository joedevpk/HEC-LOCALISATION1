import { LogOut, Mail, Shield, User, Settings, Bell, CalendarDays, Compass } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from '@/lib/router';
import { Button } from '@/components/ui';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export function ProfilePage() {
  const { profile, session, signOut } = useAuth();
  const go = useNavigate();

  return (
    <div className="mx-auto max-w-lg px-5 py-6 lg:px-8 lg:py-10">
      <h1 className="font-display text-2xl font-bold text-hec-950">Profil</h1>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6">
        <div className="flex items-center gap-4">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-16 w-16 rounded-2xl object-cover"
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-hec-950 text-2xl font-bold text-white">
              {(profile?.full_name || 'V')[0].toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-display text-lg font-bold text-hec-950">
              {profile?.full_name || 'Visiteur'}
            </p>
            <p className="text-sm text-slate-500">{profile?.role ?? 'VISITOR'}</p>
          </div>
        </div>

        <dl className="mt-5 space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <Mail className="h-4 w-4 text-slate-400" />
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                E-mail
              </dt>
              <dd className="text-sm font-medium text-hec-950">
                {session?.user?.email ?? '—'}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <Shield className="h-4 w-4 text-slate-400" />
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Rôle
              </dt>
              <dd className="text-sm font-medium text-hec-950">
                {profile?.role ?? 'VISITOR'}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <User className="h-4 w-4 text-slate-400" />
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Membre depuis
              </dt>
              <dd className="text-sm font-medium text-hec-950">
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString('fr-FR')
                  : '—'}
              </dd>
            </div>
          </div>
        </dl>

        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Langue
          </p>
          <LanguageSwitcher />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={() => go('/settings')}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Settings className="h-4 w-4" />
            Paramètres
          </button>
          <button
            onClick={() => go('/notifications')}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Bell className="h-4 w-4" />
            Notifications
          </button>
          <button
            onClick={() => go('/schedule')}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <CalendarDays className="h-4 w-4" />
            Emploi du temps
          </button>
          <button
            onClick={() => go('/tour')}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Compass className="h-4 w-4" />
            Découvrir HEC
          </button>
        </div>

        <Button
          variant="secondary"
          className="mt-6 w-full"
          icon={<LogOut className="h-4 w-4" />}
          onClick={() => signOut().then(() => go('/'))}
        >
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}
