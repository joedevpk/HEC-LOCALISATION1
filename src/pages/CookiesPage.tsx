import { Callout, DataTable, LegalLayout, LegalSection, type TocItem } from '@/components/LegalLayout';
import { useNavigate } from '@/lib/router';
import { STORAGE_KEYS } from '@/lib/legal-config';

const toc: TocItem[] = [
  { id: 'resume', label: 'En bref' },
  { id: 'stockage', label: 'Technologies utilisées' },
  { id: 'tiers', label: 'Services tiers' },
  { id: 'gerer', label: 'Gérer vos choix' },
];

export function CookiesPage() {
  const go = useNavigate();
  const code = (s: string) => <code className="rounded bg-slate-100 px-1 py-0.5 text-[13px]">{s}</code>;
  return (
    <LegalLayout
      title="Politique de cookies"
      subtitle="Quelles technologies de stockage HEC Localisation utilise réellement."
      toc={toc}
    >
      <LegalSection id="resume" title="En bref">
        <p>
          <strong>Le code de l'application n'écrit aucun cookie.</strong> Elle utilise à la place le
          stockage local de votre navigateur, uniquement pour son fonctionnement et vos préférences.
        </p>
        <ul>
          <li><strong>Cookies nécessaires :</strong> aucun cookie n'est défini par l'application.</li>
          <li><strong>Préférences :</strong> stockées localement (langue, thème, accessibilité…).</li>
          <li><strong>Mesure d'audience :</strong> aucune. Aucun outil d'analyse ni de publicité n'est présent.</li>
          <li><strong>Services tiers :</strong> voir ci-dessous.</li>
        </ul>
        <Callout>
          Comme aucun traceur non nécessaire n'est utilisé par l'application, aucun bandeau de consentement
          aux cookies n'est affiché. Si un outil de mesure d'audience ou un autre traceur était ajouté un
          jour, un choix « Accepter / Refuser / Personnaliser » serait alors mis en place avant son activation.
        </Callout>
      </LegalSection>

      <LegalSection id="stockage" title="Technologies utilisées par l'application">
        <DataTable
          headers={['Élément', 'Nature', 'Finalité', 'Durée']}
          rows={[
            [code('sb-…-auth-token'), 'Stockage local (Supabase)', 'Garder votre session de connexion. Créé seulement si vous vous connectez.', 'Jusqu’à déconnexion ou effacement des données du navigateur.'],
            [code(STORAGE_KEYS.settings), 'Stockage local', 'Préférences d’affichage et de notification.', 'Jusqu’à effacement.'],
            [code(STORAGE_KEYS.privacyPrefs), 'Stockage local', 'Votre choix d’enregistrer ou non l’historique de recherche.', 'Jusqu’à effacement.'],
            [code(STORAGE_KEYS.pwaBannerDismissed), 'Stockage local', 'Ne plus afficher l’invitation à installer l’application.', 'Jusqu’à effacement.'],
            [code(`${STORAGE_KEYS.onboardingSeenPrefix}<id>`), 'Stockage local', 'Ne pas réafficher l’introduction de bienvenue (la clé contient l’identifiant de votre compte).', 'Jusqu’à effacement.'],
            [code(STORAGE_KEYS.oauthPending), 'Stockage de session', 'Finaliser une connexion Google/GitHub.', 'Fermeture de l’onglet.'],
            [code(STORAGE_KEYS.chunkReload), 'Stockage de session', 'Recharger une seule fois après une mise à jour de l’application.', 'Fermeture de l’onglet.'],
            ['Copie hors ligne', 'Cache du navigateur (service worker)', 'Ouvrir l’application sans connexion : fichiers de l’application, données publiques du campus (bâtiments, lieux, réseau piéton, événements, annonces) et photos consultées. Les données privées ne sont pas mises en cache.', 'Renouvelées régulièrement (données : 7 jours max ; photos : 30 jours max).'],
          ]}
        />
        <p>
          Ces éléments sont <strong>strictement nécessaires</strong> au service demandé ou servent à mémoriser
          vos préférences ; ils ne servent ni au suivi publicitaire ni au profilage.
        </p>
      </LegalSection>

      <LegalSection id="tiers" title="Services tiers">
        <p>
          Votre navigateur contacte des services tiers pour afficher la carte et les polices (MapTiler ou
          autre fournisseur de carte, OpenStreetMap, Overpass, Google Fonts) et, si vous le choisissez, pour
          la connexion Google ou GitHub. L'application ne dépose pas de cookie pour eux, mais nous ne
          pouvons pas décrire ce que ces services font de leur côté : reportez-vous à leurs politiques.
          Détails sur la <a href="#/privacy">politique de confidentialité</a>.
        </p>
      </LegalSection>

      <LegalSection id="gerer" title="Gérer vos choix">
        <ul>
          <li>Vous pouvez effacer le stockage local et le cache dans les réglages de votre navigateur ; vous serez alors déconnecté et vos préférences locales seront réinitialisées.</li>
          <li>
            Vos préférences de confidentialité sont dans{' '}
            <a
              href="#/settings?section=privacy"
              onClick={(e) => {
                e.preventDefault();
                go('/settings', { section: 'privacy' });
              }}
            >
              Paramètres → Confidentialité et données
            </a>{' '}
            (connexion requise).
          </li>
        </ul>
      </LegalSection>
    </LegalLayout>
  );
}
