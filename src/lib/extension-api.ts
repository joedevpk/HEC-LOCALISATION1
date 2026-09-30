import { supabase } from '@/lib/supabase';
import type {
  Booking,
  NotificationItem,
  Report,
  ScheduleEntry,
  UserSettings,
} from '@/lib/settings-types';
import type { CampusLocation } from '@/lib/types';

export async function getUserSettings(
  userId: string,
): Promise<UserSettings | null> {
  const { data } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as UserSettings) ?? null;
}

export async function upsertUserSettings(
  userId: string,
  settings: UserSettings,
): Promise<void> {
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    ...settings,
  });
  if (error) throw error;
}

export async function getNotifications(userId: string): Promise<NotificationItem[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as NotificationItem[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw error;
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
}

export async function getBookings(userId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, location:locations(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as Booking[];
}

export async function checkBookingConflict(
  locationId: string,
  date: string,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('location_id', locationId)
    .eq('date', date)
    .neq('status', 'CANCELLED')
    .or(`start_time.lt.${endTime},end_time.gt.${startTime}`)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function createBooking(
  locationId: string,
  date: string,
  startTime: string,
  endTime: string,
  purpose: string,
): Promise<void> {
  const { error } = await supabase.from('bookings').insert({
    location_id: locationId,
    date,
    start_time: startTime,
    end_time: endTime,
    purpose,
  });
  if (error) throw error;
}

export async function cancelBooking(id: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'CANCELLED' })
    .eq('id', id);
  if (error) throw error;
}

export async function getReports(userId: string): Promise<Report[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as Report[];
}

export async function createReport(
  category: string,
  description: string,
  locationLabel: string,
): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    category,
    description,
    location_label: locationLabel,
  });
  if (error) throw error;
}

export async function getSchedules(campusId: string): Promise<ScheduleEntry[]> {
  const { data, error } = await supabase
    .from('schedules')
    .select('*, room:locations(*)')
    .eq('campus_id', campusId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ScheduleEntry[];
}

export async function clearSearchHistory(userId: string): Promise<void> {
  const { error } = await supabase
    .from('search_history')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
}

export async function getBookableRooms(
  locations: CampusLocation[],
): Promise<CampusLocation[]> {
  return locations.filter(
    (l) => l.kind === 'room' && l.capacity != null && l.capacity > 0,
  );
}

export async function getQRCodes(): Promise<
  { id: string; location_id: string; code: string; is_active: boolean }[]
> {
  const { data, error } = await supabase
    .from('qr_codes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as { id: string; location_id: string; code: string; is_active: boolean }[];
}

export async function toggleQRCode(id: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('qr_codes')
    .update({ is_active: active })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Crée un nouvel enregistrement `qr_codes` (admin authentifié uniquement —
 * voir policies RLS côté Supabase). C'est la seule écriture qui fait
 * exister un `code` : l'image du QR elle-même n'est jamais stockée, elle
 * est toujours redessinée à la volée à partir de ce `code` (voir qr-utils.ts).
 *
 * Le lieu (`locationId`) doit correspondre à un `locations.id` existant.
 * `code` doit être unique dans `qr_codes` — une violation de contrainte
 * unique Supabase remonte ici (error.code === '23505') pour que l'appelant
 * puisse proposer un autre code.
 */
export async function createQRCode(
  locationId: string,
  code: string,
): Promise<{ id: string; location_id: string; code: string; is_active: boolean }> {
  const { data, error } = await supabase
    .from('qr_codes')
    .insert({ location_id: locationId, code, is_active: true })
    .select('id, location_id, code, is_active')
    .single();
  if (error) throw error;
  return data as { id: string; location_id: string; code: string; is_active: boolean };
}

/**
 * Supprime définitivement un enregistrement `qr_codes` (admin authentifié
 * uniquement — voir policies RLS côté Supabase). Un QR déjà imprimé pointera
 * alors vers un code introuvable : `getQRCodeByCode` renverra `null` et
 * `QRScanPage` affichera `qr.notFound`. Pour désactiver temporairement un QR
 * sans casser les exemplaires déjà imprimés, préférer `toggleQRCode`.
 */
export async function deleteQRCode(id: string): Promise<void> {
  const { error } = await supabase.from('qr_codes').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Lecture SEULE d'un QR code par son code public (utilisée par la page
 * publique /qr-scan, accessible à des visiteurs anonymes). Ne fait jamais
 * d'écriture : la modification d'un QR reste réservée à getQRCodes()/
 * toggleQRCode() côté admin authentifié.
 *
 * ⚠️ Nécessite qu'une policy RLS Supabase autorise le SELECT public
 * (rôle anon) sur `qr_codes` — sans quoi cette requête échouera pour un
 * visiteur non connecté. Exemple de policy à ajouter côté Supabase :
 *
 *   create policy "qr_codes_public_read"
 *     on qr_codes for select
 *     to anon
 *     using (true);
 *
 * Aucune policy d'écriture (insert/update/delete) ne doit être ajoutée
 * pour le rôle anon.
 */
export async function getQRCodeByCode(
  code: string,
): Promise<{ id: string; location_id: string; code: string; is_active: boolean } | null> {
  const { data, error } = await supabase
    .from('qr_codes')
    .select('id, location_id, code, is_active')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string; location_id: string; code: string; is_active: boolean }) ?? null;
}
