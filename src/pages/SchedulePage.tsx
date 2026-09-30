import { useEffect, useMemo, useState } from 'react';
import { Clock, GraduationCap, MapPin, Navigation, User } from 'lucide-react';
import { useCampus } from '@/context/CampusContext';
import { useSettings } from '@/context/SettingsContext';
import { getSchedules } from '@/lib/extension-api';
import type { ScheduleEntry } from '@/lib/settings-types';
import { useNavigate } from '@/lib/router';
import { Button, EmptyState } from '@/components/ui';

const dayNames: Record<string, string[]> = {
  fr: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  ln: ['Mokolo 1', 'Mokolo 2', 'Mokolo 3', 'Mokolo 4', 'Mokolo 5', 'Mokolo 6', 'Liposo'],
};

export function SchedulePage() {
  const { campus } = useCampus();
  const { t, settings } = useSettings();
  const go = useNavigate();
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'today' | 'week'>('today');

  useEffect(() => {
    if (!campus) return;
    getSchedules(campus.id)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [campus]);

  const today = new Date().getDay() || 1; // 0=Sunday → shift to 1
  const days = dayNames[settings.language] ?? dayNames.fr;

  const todayEntries = useMemo(
    () => entries.filter((e) => e.day_of_week === today),
    [entries, today],
  );

  const display = view === 'today' ? todayEntries : entries;
  const grouped = useMemo(() => {
    const map = new Map<number, ScheduleEntry[]>();
    for (const e of display) {
      const arr = map.get(e.day_of_week) ?? [];
      arr.push(e);
      map.set(e.day_of_week, arr);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [display]);

  if (loading)
    return <p className="px-5 py-6 text-sm text-slate-500">{t('common.loading')}</p>;

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8 lg:py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-hec-950">
          {t('schedule.title')}
        </h1>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {(['today', 'week'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                view === v ? 'bg-white text-hec-950 shadow-sm' : 'text-slate-500'
              }`}
            >
              {v === 'today' ? t('schedule.today') : t('schedule.week')}
            </button>
          ))}
        </div>
      </div>

      {display.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Clock className="h-5 w-5" />}
            title={t('schedule.empty')}
            description=""
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-hec-500">
                {days[day - 1] ?? `J${day}`}
              </h2>
              <div className="space-y-2">
                {items.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4"
                  >
                    <div className="flex w-16 shrink-0 flex-col items-center">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-hec-950 text-white">
                        <GraduationCap className="h-5 w-5" />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-hec-950">{e.course_name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        {e.teacher_name && (
                          <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {e.teacher_name}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {e.start_time} – {e.end_time}
                        </span>
                        {e.room && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {e.room.name}
                          </span>
                        )}
                      </div>
                    </div>
                    {e.room && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Navigation className="h-4 w-4" />}
                        onClick={() => go('/map', { loc: e.room!.id })}
                      >
                        {t('common.guide')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
