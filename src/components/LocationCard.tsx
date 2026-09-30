import { ChevronRight } from 'lucide-react';
import type { CampusLocation } from '@/lib/types';
import { categoryLabel, locationIcon } from '@/lib/display';

export function LocationCard({
  location,
  onClick,
  trailing,
}: {
  location: CampusLocation;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  const Icon = locationIcon(location);
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left transition-all hover:border-hec-200 hover:shadow-glass dark:border-hec-800 dark:bg-hec-900 dark:hover:border-hec-600"
    >
      {location.primary_image_url || location.building?.primary_image_url ? (
        <img
          src={location.primary_image_url ?? location.building?.primary_image_url ?? ''}
          alt={location.name}
          className="h-11 w-11 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white"
          style={{ background: location.building?.color ?? '#1e5eff' }}
        >
          <Icon className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold text-hec-950 dark:text-white">
            {location.name}
          </span>
          {location.code && (
            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-hec-800 dark:text-slate-300">
              {location.code}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span>{categoryLabel(location)}</span>
          {location.building && (
            <>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span className="truncate">{location.building.name.split('—')[0].trim()}</span>
            </>
          )}
        </span>
      </span>
      {trailing ?? (
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-hec-500 dark:text-slate-600" />
      )}
    </button>
  );
}
