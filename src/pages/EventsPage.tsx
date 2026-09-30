import { useMemo } from 'react';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { useCampus } from '@/context/CampusContext';

export function EventsPage() {
  const { events } = useCampus();

  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
      ),
    [events],
  );

  return (
    <div className="mx-auto max-w-4xl px-5 py-6 lg:px-8 lg:py-10">
      <h1 className="font-display text-2xl font-bold text-hec-950">
        Événements du campus
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Découvrez les prochains événements organisés à HEC Kinshasa.
      </p>

      {sorted.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">Aucun événement à venir.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {sorted.map((ev) => (
            <div
              key={ev.id}
              className="rounded-2xl border border-slate-100 bg-white p-5"
            >
              <div className="flex items-center gap-2 text-xs text-hec-500">
                <CalendarDays className="h-3.5 w-3.5" />
                {new Date(ev.starts_at).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <h3 className="mt-2 font-display text-lg font-bold text-hec-950">
                {ev.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600">{ev.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                {ev.location_label && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {ev.location_label}
                  </span>
                )}
                {ev.organizer && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {ev.organizer}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
