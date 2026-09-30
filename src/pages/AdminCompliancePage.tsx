import { AlertTriangle, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { useNavigate } from '@/lib/router';
import { hasOfficialContact } from '@/lib/legal-config';

type Status = 'ok' | 'check' | 'missing';

interface Item {
  label: string;
  status: Status;
  detail: string;
}

/**
 * Décode la charge utile (publique) d'un JWT pour lire son champ `role`.
 * Sert à vérifier que la clé Supabase embarquée dans le frontend est
 * bien la clé publique « anon » et JAMAIS une clé « service_role ».
 * Ne journalise, n'affiche et ne stocke jamais la clé elle-même.
 */
function supabaseKeyRole(): string | null {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!key) return null;
  try {
    const payload = key.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.role === 'string' ? json.role : null;
  } catch {
    return null;
  }
}

function buildItems(): Item[] {
  const role = supabaseKeyRole();
  const logEndpoint = Boolean(import.meta.env.VITE_LOG_ENDPOINT);

  const keyItem: Item =
    role === 'anon'
      ? { label: 'Clé Supabase du frontend', status: 'ok', detail: 'La clé embarquée est bien une clé publique « anon » (contrôlé à l’exécution).' }
      : role === 'service_role'
        ? { label: 'Clé Supabase du frontend', status: 'missing', detail: 'ALERTE : la clé embarquée est une clé « service_role ». La retirer immédiatement et la régénérer.' }
        : { label: 'Clé Supabase du frontend', status: 'check', detail: 'Le rôle de la clé n’a pas pu être lu. Vérifier que VITE_SUPABASE_ANON_KEY est la clé « anon » publique.' };

  return [
    { label: 'Politique de confidentialité (/privacy)', status: 'ok', detail: 'Page rédigée d’après l’audit du code ; aucune durée ni pratique tierce inventée.' },
    { label: 'Conditions d’utilisation (/terms)', status: 'ok', detail: 'Inclut la mention sur le caractère indicatif du guidage.' },
    { label: 'Politique de cookies (/cookies)', status: 'ok', detail: 'Décrit le stockage réellement utilisé : aucun cookie écrit par le code.' },
    { label: 'Tarifs et paiements (/billing)', status: 'ok', detail: 'Indique qu’aucun paiement n’existe. Aucune politique de remboursement fictive.' },
    { label: 'Bandeau de consentement aux cookies', status: 'missing', detail: 'Non implémenté car non requis d’après l’audit (aucun traceur non nécessaire, aucune mesure d’audience). À mettre en place avant d’ajouter tout outil de suivi.' },
    { label: 'Consentement à l’inscription', status: 'ok', detail: 'Case non pré-cochée ; inscription (e-mail et Google/GitHub) bloquée tant qu’elle n’est pas cochée.' },
    { label: 'Géolocalisation expliquée', status: 'ok', detail: 'Finalité affichée pendant la demande, message en cas de refus, section dédiée dans la politique de confidentialité.' },
    { label: 'Collecte minimale', status: 'ok', detail: 'Aucune donnée ajoutée pour cette couche de conformité ; la position GPS n’est pas enregistrée en base.' },
    { label: 'Préférences de confidentialité (Paramètres)', status: 'ok', detail: 'Historique de recherche (activer/désactiver/effacer), état de la géolocalisation, liens légaux.' },
    { label: 'Consulter et exporter mes données', status: 'ok', detail: 'Affichage et téléchargement JSON des données du compte, depuis les requêtes existantes.' },
    { label: 'Suppression de compte en libre-service', status: 'missing', detail: 'Non implémenté (nécessiterait une fonction serveur sécurisée). Procédure actuelle : demande à l’administration ; la suppression du compte supprime en cascade les données rattachées (d’après le schéma).' },
    keyItem,
    { label: 'RLS (règles d’accès Supabase)', status: 'check', detail: 'Les migrations activent la RLS sur 19 tables avec des politiques « propriétaire uniquement » pour les données privées. L’état du projet Supabase en ligne ne peut pas être contrôlé depuis l’application : à vérifier dans le tableau de bord (Authentication → Policies).' },
    { label: 'Rôles et SUPER_ADMIN', status: 'check', detail: 'Des triggers empêchent l’auto-attribution d’un rôle d’administration (migration 20260826210000). À confirmer sur le projet en ligne.' },
    { label: 'Storage (photos)', status: 'check', detail: 'Limite 5 Mo et types d’image imposés par la migration 20260930090000 — à appliquer, puis vérifier les policies du bucket.' },
    { label: 'Protection des formulaires (double clic)', status: 'ok', detail: 'Connexion/inscription, signalements et réservations : verrou + bouton désactivé. Les formulaires d’administration n’ont pas été audités un à un.' },
    { label: 'Gestion des erreurs', status: 'ok', detail: 'Délais maximaux réseau, ErrorBoundary par page, messages avec « Réessayer », journal sans données sensibles.' },
    { label: 'Journalisation', status: logEndpoint ? 'check' : 'ok', detail: logEndpoint ? 'Un collecteur d’erreurs externe (VITE_LOG_ENDPOINT) est configuré : le mentionner dans la politique de confidentialité (déjà prévu) et vérifier son contrat.' : 'Journal local uniquement ; mots de passe, jetons, e-mails et positions ne sont pas enregistrés.' },
    { label: 'Documentation des services tiers', status: 'ok', detail: 'Supabase, MapTiler (ou Mapbox/Esri), OpenStreetMap, Overpass, Google Fonts, Google/GitHub : décrits sans supposer leurs pratiques.' },
    { label: 'Coordonnées officielles de contact', status: hasOfficialContact ? 'ok' : 'check', detail: hasOfficialContact ? 'Une adresse de contact officielle est configurée (VITE_CONTACT_EMAIL).' : 'Non renseignées : définir VITE_CONTACT_EMAIL (et facultativement VITE_CONTACT_PHONE, VITE_CONTACT_ADDRESS, VITE_LEGAL_ENTITY) au déploiement.' },
    { label: 'Durées de conservation', status: 'check', detail: 'Aucune purge automatique n’existe. L’établissement doit fixer des durées (historique, signalements, réservations).' },
    { label: 'Sauvegardes Supabase', status: 'check', detail: 'À vérifier dans le tableau de bord ; voir docs/BACKUP_RESTORE.md.' },
    { label: 'Validation juridique des textes', status: 'check', detail: 'Les textes n’ont pas été relus par un juriste : loi applicable, responsable du traitement, clauses de responsabilité.' },
  ];
}

const STATUS_UI: Record<Status, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  ok: { label: 'Implémenté', icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  check: { label: 'À vérifier', icon: AlertTriangle, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  missing: { label: 'Non implémenté', icon: XCircle, cls: 'bg-red-50 text-red-600 border-red-100' },
};

export function AdminCompliancePage() {
  const go = useNavigate();
  const items = buildItems();
  const count = (s: Status) => items.filter((i) => i.status === s).length;

  return (
    <div className="mx-auto max-w-4xl px-5 py-6 lg:px-8 lg:py-10">
      <button
        type="button"
        onClick={() => go('/admin')}
        className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-hec-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Administration
      </button>
      <h1 className="font-display text-2xl font-bold text-hec-950">Conformité et confiance</h1>
      <p className="mt-1 text-sm text-slate-500">
        État réel du projet — un élément n'est « Implémenté » que s'il existe dans le code ou peut être
        contrôlé ici. Ce tableau ne constitue pas une attestation de conformité juridique.
      </p>

      <dl className="mt-5 grid grid-cols-3 gap-3">
        {(['ok', 'check', 'missing'] as Status[]).map((s) => (
          <div key={s} className={`rounded-2xl border px-4 py-3 text-center ${STATUS_UI[s].cls}`}>
            <dd className="font-display text-2xl font-extrabold">{count(s)}</dd>
            <dt className="text-xs font-semibold">{STATUS_UI[s].label}</dt>
          </div>
        ))}
      </dl>

      <ul className="mt-6 space-y-3">
        {items.map((item) => {
          const ui = STATUS_UI[item.status];
          const Icon = ui.icon;
          return (
            <li key={item.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-hec-950">{item.label}</p>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${ui.cls}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {ui.label}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.detail}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
