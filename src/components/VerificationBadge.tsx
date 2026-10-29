import { AlertTriangle, BadgeCheck, Archive } from 'lucide-react';
import { verificationInfo } from '@/lib/data-quality';
import type { DataQualityFields } from '@/lib/types';

/**
 * Statut de validation d'un lieu. Une donnée non validée n'est jamais présentée comme confirmée :
 * le libellé est toujours écrit (jamais la couleur seule).
 */
export function VerificationBadge({
  entity,
  compact = false,
}: {
  entity: (DataQualityFields & { archived_at?: string | null }) | null | undefined;
  compact?: boolean;
}) {
  const info = verificationInfo(entity);
  const Icon = info.tone === 'ok' ? BadgeCheck : info.status === 'archived' ? Archive : AlertTriangle;
  const tone =
    info.tone === 'ok'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : info.tone === 'warn'
      ? 'bg-amber-50 text-amber-900 border-amber-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
      title={info.confirmed ? 'Donnée vérifiée et validée par l’administration' : 'Cette information n’a pas encore été confirmée par l’administration'}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{compact && !info.confirmed ? 'Non validé' : info.label}</span>
    </span>
  );
}
