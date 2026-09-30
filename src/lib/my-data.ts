// ---------------------------------------------------------------------
// « Mes données » : lecture et export des données du compte connecté.
//
// N'ajoute AUCUNE collecte : ne fait que relire, avec les règles d'accès
// (RLS) de l'utilisateur, ce que l'application a déjà enregistré pour
// lui. Rien n'est envoyé à un tiers : l'export est généré dans le
// navigateur et téléchargé localement.
// ---------------------------------------------------------------------
import { supabase } from '@/lib/supabase';
import { getFavorites } from '@/lib/api';
import { getBookings, getNotifications, getReports, getUserSettings } from '@/lib/extension-api';

export interface MyDataSummary {
  favorites: number;
  searches: number;
  bookings: number;
  reports: number;
  notifications: number;
}

export interface MyDataExport {
  exported_at: string;
  account: { id: string; email: string | null; full_name: string | null; role: string | null; created_at: string | null };
  settings: unknown;
  favorites_location_ids: string[];
  search_history: { query: string; created_at: string }[];
  bookings: unknown[];
  reports: unknown[];
  notifications: unknown[];
  note: string;
}

async function getSearchHistory(userId: string): Promise<{ query: string; created_at: string }[]> {
  const { data, error } = await supabase
    .from('search_history')
    .select('query, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as { query: string; created_at: string }[];
}

/** Rassemble les données du compte (limites : 500 recherches, 100 réservations/signalements, 50 notifications). */
export async function collectMyData(
  user: { id: string; email?: string | null; created_at?: string | null },
  profile: { full_name?: string | null; role?: string | null } | null,
): Promise<MyDataExport> {
  const [settings, favorites, searches, bookings, reports, notifications] = await Promise.all([
    getUserSettings(user.id),
    getFavorites(user.id),
    getSearchHistory(user.id),
    getBookings(user.id),
    getReports(user.id),
    getNotifications(user.id),
  ]);
  return {
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      full_name: profile?.full_name ?? null,
      role: profile?.role ?? null,
      created_at: user.created_at ?? null,
    },
    settings,
    favorites_location_ids: favorites,
    search_history: searches,
    bookings,
    reports,
    notifications,
    note: 'Export limité aux données les plus récentes (500 recherches, 100 réservations, 100 signalements, 50 notifications). Aucune position GPS n’est enregistrée par l’application.',
  };
}

export function summarize(data: MyDataExport): MyDataSummary {
  return {
    favorites: data.favorites_location_ids.length,
    searches: data.search_history.length,
    bookings: data.bookings.length,
    reports: data.reports.length,
    notifications: data.notifications.length,
  };
}

/** Télécharge l'export en JSON, sans le transmettre à aucun serveur. */
export function downloadMyData(data: MyDataExport): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hec-localisation-mes-donnees-${data.exported_at.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
