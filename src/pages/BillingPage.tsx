import { CreditCard } from 'lucide-react';
import { Callout, LegalLayout, LegalSection, type TocItem } from '@/components/LegalLayout';

const toc: TocItem[] = [{ id: 'statut', label: 'Achats et abonnements' }];

/**
 * Le code de l'application ne contient AUCUN système de paiement (audit
 * du 30/09/2026 : pas de fournisseur de paiement, pas de facturation).
 * Cette page l'indique simplement ; aucune politique de remboursement
 * n'est inventée. À réviser si un paiement est un jour ajouté.
 */
export function BillingPage() {
  return (
    <LegalLayout
      title="Tarifs et paiements"
      subtitle="Ce que coûte HEC Localisation."
      toc={toc}
    >
      <LegalSection id="statut" title="Achats et abonnements">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-hec-50 text-hec-600" aria-hidden="true">
            <CreditCard className="h-5 w-5" />
          </span>
          <p className="text-base font-semibold text-hec-950">
            HEC Localisation ne propose actuellement aucun achat ou abonnement payant.
          </p>
        </div>
        <p>
          Aucun moyen de paiement n'est demandé dans l'application. Les réservations de salles ne
          comportent aucun paiement en ligne.
        </p>
        <Callout>
          Si un service payant était ajouté à l'avenir, les conditions de paiement, d'annulation et de
          remboursement seraient publiées ici avant sa mise en service.
        </Callout>
      </LegalSection>
    </LegalLayout>
  );
}
