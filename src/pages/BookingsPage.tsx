import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, Clock, MapPin, Send } from 'lucide-react';
import { useCampus } from '@/context/CampusContext';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import {
  cancelBooking,
  checkBookingConflict,
  createBooking,
  getBookings,
} from '@/lib/extension-api';
import type { Booking } from '@/lib/settings-types';
import { Button, EmptyState } from '@/components/ui';

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-600',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const statusLabels: Record<string, Record<string, string>> = {
  fr: { PENDING: 'En attente', APPROVED: 'Approuvée', REJECTED: 'Refusée', CANCELLED: 'Annulée' },
  en: { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled' },
  ln: { PENDING: 'Na kozela', APPROVED: 'Ezwi', REJECTED: 'Ebebi', CANCELLED: 'Ebebi' },
};

export function BookingsPage() {
  const { locations } = useCampus();
  const { session } = useAuth();
  const { t, settings } = useSettings();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const bookableRooms = locations.filter(
    (l) => l.kind === 'room' && l.capacity != null,
  );

  const [roomId, setRoomId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [purpose, setPurpose] = useState('');

  const load = () => {
    if (!session) return;
    setLoading(true);
    getBookings(session.user.id)
      .then(setBookings)
      .finally(() => setLoading(false));
  };

  useEffect(load, [session]);

  // Verrou synchrone contre le double envoi (voir ReportsPage).
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);
    setSuccess(false);
    if (!roomId || !date || !startTime || !endTime) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const conflict = await checkBookingConflict(roomId, date, startTime, endTime);
      if (conflict) {
        setError(t('booking.conflict'));
        return;
      }
      await createBooking(roomId, date, startTime, endTime, purpose);
      setSuccess(true);
      setShowForm(false);
      setRoomId('');
      setDate('');
      setStartTime('');
      setEndTime('');
      setPurpose('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue. Réessayez.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    await cancelBooking(id);
    load();
  };

  const st = statusLabels[settings.language] ?? statusLabels.fr;

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8 lg:py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-hec-950">
          {t('booking.title')}
        </h1>
        <Button
          size="sm"
          icon={<CalendarDays className="h-4 w-4" />}
          onClick={() => setShowForm((s) => !s)}
        >
          {t('booking.new')}
        </Button>
      </div>

      {success && (
        <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {t('booking.success')}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={submit}
          className="mt-5 rounded-2xl border border-slate-100 bg-white p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('booking.selectRoom')}
              </span>
              <select
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
              >
                <option value="">—</option>
                {bookableRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('booking.selectDate')}
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('booking.startTime')}
              </span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('booking.endTime')}
              </span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
              />
            </label>
          </div>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t('booking.purpose')}
            </span>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Réunion, révision, projet…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
            />
          </label>
          <div className="mt-5 flex gap-2">
            <Button type="submit" icon={<Send className="h-4 w-4" />} loading={submitting}>
              {t('booking.submit')}
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}

      <h2 className="mt-8 font-display text-lg font-bold text-hec-950">
        {t('booking.myBookings')}
      </h2>
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">{t('common.loading')}</p>
      ) : bookings.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            title={t('booking.empty')}
            description={t('booking.emptyDesc')}
          />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {bookings.map((b) => {
            const room = locations.find((l) => l.id === b.location_id);
            return (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-hec-50 text-hec-600">
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-hec-950">
                    {room?.name ?? 'Salle'}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {b.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {b.start_time} – {b.end_time}
                    </span>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[b.status] ?? statusColors.PENDING}`}
                >
                  {st[b.status] ?? b.status}
                </span>
                {b.status === 'PENDING' && (
                  <button
                    onClick={() => handleCancel(b.id)}
                    className="text-xs font-medium text-slate-400 hover:text-red-500"
                  >
                    {t('common.cancel')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
