import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Zap,
  Droplets,
  Wifi,
  Sparkles,
  Armchair,
  DoorOpen,
  ShieldAlert,
  HelpCircle,
  Send,
  MapPin,
} from 'lucide-react';
import { useCampus } from '@/context/CampusContext';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { createReport, getReports } from '@/lib/extension-api';
import type { Report } from '@/lib/settings-types';
import { Button, EmptyState } from '@/components/ui';

const categories = [
  { key: 'electricity', icon: Zap },
  { key: 'water', icon: Droplets },
  { key: 'internet', icon: Wifi },
  { key: 'cleanliness', icon: Sparkles },
  { key: 'furniture', icon: Armchair },
  { key: 'room', icon: DoorOpen },
  { key: 'security', icon: ShieldAlert },
  { key: 'other', icon: HelpCircle },
];

const statusColors: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  RESOLVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-600',
};

const statusLabels: Record<string, Record<string, string>> = {
  fr: { NEW: 'Nouveau', IN_PROGRESS: 'En traitement', RESOLVED: 'Résolu', REJECTED: 'Rejeté' },
  en: { NEW: 'New', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', REJECTED: 'Rejected' },
  ln: { NEW: 'Sika', IN_PROGRESS: 'Na kosala', RESOLVED: 'Ezwi', REJECTED: 'Ebebi' },
};

export function ReportsPage() {
  const { locations } = useCampus();
  const { session } = useAuth();
  const { t, settings } = useSettings();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [success, setSuccess] = useState(false);
  const [category, setCategory] = useState('electricity');
  const [description, setDescription] = useState('');
  const [locationLabel, setLocationLabel] = useState('');

  const load = () => {
    if (!session) return;
    setLoading(true);
    getReports(session.user.id)
      .then(setReports)
      .finally(() => setLoading(false));
  };

  useEffect(load, [session]);

  // Verrou synchrone contre le double envoi (deux clics rapprochés
  // arrivent avant le re-rendu du bouton désactivé).
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!description.trim()) {
      setSubmitError('Veuillez décrire le problème.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setSuccess(false);
    try {
      await createReport(category, description, locationLabel);
      setSuccess(true);
      setShowForm(false);
      setDescription('');
      setLocationLabel('');
      load();
    } catch {
      // Jamais d'échec silencieux : le contenu saisi est conservé pour
      // pouvoir réessayer.
      setSubmitError("Une erreur est survenue. Votre signalement n'a pas été envoyé — réessayez.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const st = statusLabels[settings.language] ?? statusLabels.fr;

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8 lg:py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-hec-950">
          {t('report.title')}
        </h1>
        <Button
          size="sm"
          icon={<ShieldAlert className="h-4 w-4" />}
          onClick={() => setShowForm((s) => !s)}
        >
          {t('report.new')}
        </Button>
      </div>

      {success && (
        <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {t('report.success')}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={submit}
          className="mt-5 rounded-2xl border border-slate-100 bg-white p-5"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('report.category')}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {categories.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-medium transition-colors ${
                  category === c.key
                    ? 'border-hec-400 bg-hec-50 text-hec-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <c.icon className="h-5 w-5" />
                {t(`report.${c.key}`)}
              </button>
            ))}
          </div>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t('report.location')}
            </span>
            <select
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
            >
              <option value="">—</option>
              {locations.map((l) => (
                <option key={l.id} value={l.name}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t('common.description')}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100"
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">
            Ne saisissez pas d'informations personnelles inutiles : ce texte est lu par l'administration.
          </p>
          {submitError && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600">
              {submitError}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <Button type="submit" icon={<Send className="h-4 w-4" />} loading={submitting}>
              {t('report.submit')}
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}

      <h2 className="mt-8 font-display text-lg font-bold text-hec-950">
        {t('report.myReports')}
      </h2>
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">{t('common.loading')}</p>
      ) : reports.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<ShieldAlert className="h-5 w-5" />}
            title={t('report.empty')}
            description={t('report.emptyDesc')}
          />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {reports.map((r) => {
            const cat = categories.find((c) => c.key === r.category);
            const Icon = cat?.icon ?? HelpCircle;
            return (
              <div
                key={r.id}
                className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {t(`report.${r.category}`)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColors[r.status] ?? statusColors.NEW}`}
                    >
                      {st[r.status] ?? r.status}
                    </span>
                  </div>
                  {r.location_label && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3 w-3" />
                      {r.location_label}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-slate-600">{r.description}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(r.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
