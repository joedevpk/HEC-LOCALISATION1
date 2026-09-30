import type { POIFilterGroup } from '@/lib/poi-categories';
import { poiFilterGroupLabels } from '@/lib/poi-categories';

const GROUPS: POIFilterGroup[] = [
  'all',
  'hec',
  'education',
  'health',
  'money',
  'food',
  'shopping',
  'sport',
  'transport',
  'services',
  'other',
];

export function POIFilters({
  active,
  onChange,
}: {
  active: POIFilterGroup;
  onChange: (group: POIFilterGroup) => void;
}) {
  return (
    <div className="glass flex gap-1.5 overflow-x-auto rounded-full border border-white/60 p-1.5 shadow-glass [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {GROUPS.map((group) => (
        <button
          key={group}
          onClick={() => onChange(group)}
          className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            active === group
              ? 'bg-hec-950 text-white'
              : 'bg-white/70 text-slate-500 hover:bg-white'
          }`}
        >
          {poiFilterGroupLabels[group]}
        </button>
      ))}
    </div>
  );
}
