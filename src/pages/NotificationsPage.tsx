import { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  AlertTriangle,
  CalendarDays,
  Wrench,
  BookOpen,
  Info,
  Settings2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useNavigate } from '@/lib/router';
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/extension-api';
import type { NotificationItem } from '@/lib/settings-types';
import { EmptyState } from '@/components/ui';

const typeIcons: Record<string, typeof Bell> = {
  announcement: Info,
  event: CalendarDays,
  room_change: AlertTriangle,
  course: BookOpen,
  booking: Check,
  maintenance: Wrench,
  alert: AlertTriangle,
  general: Bell,
};

export function NotificationsPage() {
  const { session } = useAuth();
  const { t } = useSettings();
  const go = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!session) return;
    setLoading(true);
    getNotifications(session.user.id)
      .then(setItems)
      .finally(() => setLoading(false));
  };

  useEffect(load, [session]);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
  };

  const handleMarkAll = async () => {
    if (!session) return;
    await markAllNotificationsRead(session.user.id);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
    setItems((prev) => prev.filter((n) => n.id !== id));
  };

  const unread = items.filter((n) => !n.is_read).length;

  return (
    <div className="mx-auto max-w-2xl px-5 py-6 lg:px-8 lg:py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-hec-950">
            {t('notif.title')}
          </h1>
          {unread > 0 && (
            <p className="mt-0.5 text-sm text-slate-500">
              {unread} non lue(s)
            </p>
          )}
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => go('/settings', { section: 'notifications' })}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-500 border border-slate-200 hover:bg-slate-50"
            >
              <Settings2 className="h-4 w-4" />
              Préférences
            </button>
            <button
              onClick={handleMarkAll}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-medium text-hec-600 border border-slate-200 hover:bg-hec-50"
            >
              <CheckCheck className="h-4 w-4" />
              {t('notif.markAllRead')}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Bell className="h-5 w-5" />}
            title={t('notif.empty')}
            description={t('notif.emptyDesc')}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {items.map((n) => {
            const Icon = typeIcons[n.type] ?? Bell;
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
                  n.is_read
                    ? 'border-slate-100 bg-white'
                    : 'border-hec-100 bg-hec-50/40'
                }`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                    n.is_read ? 'bg-slate-100 text-slate-400' : 'bg-hec-500 text-white'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-hec-950">{n.title}</p>
                  {n.body && (
                    <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(n.created_at).toLocaleString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {!n.is_read && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-hec-600"
                      aria-label="Marquer comme lu"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-500"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
