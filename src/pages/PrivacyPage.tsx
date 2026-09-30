import { Callout, ContactBlock, DataTable, LegalLayout, LegalSection, type TocItem } from '@/components/LegalLayout';
import { useNavigate } from '@/lib/router';
import { legalConfig } from '@/lib/legal-config';

const toc: TocItem[] = [
  { id: 'resume', label: 'En bref' },
  { id: 'donnees', label: 'Données traitées' },
  { id: 'position', label: 'Votre position' },
  { id: 'stockage', label: 'Stockage et durée' },
  { id: 'tiers', label: 'Services tiers' },
  { id: 'securite', label: 'Sécurité' },
  { id: 'droits', label: 'Vos droits' },
  { id: 'contact', label: 'Contact' },
];

/**
 * Politique de confidentialité. Chaque affirmation ci-dessous correspond
 * à ce que le code de l'application fait réellement (audit du 30/09/2026,
 * voir docs/PRIVACY_AUDIT.md). Rien n'est affirmé sur les pratiques
 * internes des services tiers.
 */
export function PrivacyPage() {
  const go = useNavigate();
  const link = (path: string, label: string, params?: Record<string, string>) => (
    <a
      href={`#${path}`}
      onClick={(e) => {
        e.preventDefault();
        go(path, params);
      }}
    >
      {label}
    </a>
  );

  return (
    <LegalLayout
      title="Politique de confidentialité"
      subtitle="Ce que HEC Localisation traite comme données, pourquoi, et comment vous gardez la main."
      toc={toc}
    >
      <LegalSection id="resume" title="En bref">
        <p>
          HEC Localisation est un service d'orientation pour le campus de la {legalConfig.institutionName}.
          Vous pouvez consulter la carte et rechercher un lieu <strong>sans créer de compte</strong>.
          Un compte n'est utile que pour conserver vos favoris, votre historique, vos réservations et vos
          signalements.
        </p>
        <ul>
          <li>Votre position GPS est utilisée pour vous situer sur la carte et calculer un itinéraire ; l'application ne l'enregistre pas dans sa base de données.</li>
          <li>Aucun outil de mesure d'audience, de publicité ou de suivi n'est présent dans l'application.</li>
          <li>L'application n'écrit aucun cookie ({link('/cookies', 'détails')}).</li>
          <li>L'application ne propose aucun achat ni abonnement payant.</li>
        </ul>
        <Callout title="Responsable du service">
          {legalConfig.entity ?? legalConfig.institutionName}
          {legalConfig.entity ? '' : ' — l’identité juridique exacte du responsable du traitement doit être confirmée par l’établissement.'}
        </Callout>
      </LegalSection>

      <LegalSection id="donnees" title="Données traitées et pourquoi">
        <p>Seules les données nécessaires à chaque fonction sont traitées.</p>
        <DataTable
          headers={['Donnée', 'Pourquoi', 'Où et quand']}
          rows={[
            [
              'Adresse e-mail et mot de passe',
              'Créer un compte et vous connecter.',
              'Service d’authentification (Supabase). Le mot de passe n’est jamais affiché ni relu par l’application. Uniquement si vous créez un compte.',
            ],
            [
              'Nom complet et profil (Étudiant, Enseignant, Personnel, Visiteur)',
              'Personnaliser l’espace et appliquer les droits d’accès.',
              'Base de données (Supabase). Le rôle choisi à l’inscription est contrôlé côté serveur ; les rôles d’administration ne peuvent pas être attribués par l’utilisateur.',
            ],
            [
              'Compte Google ou GitHub',
              'Se connecter sans mot de passe.',
              'Le fournisseur transmet à l’authentification les informations de votre compte (par exemple nom, e-mail et photo, selon vos réglages chez lui). Une photo fournie ainsi est affichée, l’application ne vous demande jamais d’en envoyer une.',
            ],
            [
              'Préférences (langue, thème, taille du texte, contraste, animations, itinéraire accessible, notifications)',
              'Adapter l’affichage à vos besoins.',
              'Sur votre appareil. Si vous êtes connecté, aussi dans votre compte pour les retrouver ailleurs.',
            ],
            [
              'Favoris',
              'Retrouver vos lieux enregistrés.',
              'Votre compte, si vous êtes connecté.',
            ],
            [
              'Historique de recherche (texte de vos recherches)',
              'Vous proposer vos recherches récentes.',
              'Votre compte, si vous êtes connecté. Vous pouvez le désactiver et l’effacer (Paramètres → Confidentialité et données).',
            ],
            [
              'Réservations (lieu, date, heures, motif)',
              'Enregistrer et suivre votre demande.',
              'Votre compte, uniquement si vous utilisez cette fonction.',
            ],
            [
              'Signalements (catégorie, description, libellé du lieu)',
              'Transmettre un problème à l’administration.',
              'Votre compte, uniquement si vous utilisez cette fonction. Ne saisissez pas d’informations personnelles inutiles dans la description.',
            ],
            [
              'Notifications reçues',
              'Vous informer (annonces, événements, réservations…).',
              'Votre compte, selon les types que vous avez activés.',
            ],
            [
              'Photos des bâtiments et lieux',
              'Illustrer les fiches du campus.',
              'Ajoutées uniquement par les administrateurs ; ce ne sont pas des données d’utilisateurs.',
            ],
          ]}
        />
        <p>
          <strong>Données techniques.</strong> Comme pour tout site web, chaque service contacté par votre
          navigateur (hébergeur, Supabase, fournisseurs de carte, polices) reçoit nécessairement votre
          adresse IP et les informations techniques d’une requête web. L’application ne lit pas votre IP.
        </p>
        <p>
          <strong>Journal d’erreurs.</strong> Une erreur technique peut être notée localement (page sans
          paramètres, type d’erreur, message). Aucun mot de passe, jeton ni position n’y est inscrit. Ces
          erreurs ne quittent votre appareil que si l’établissement a configuré un service de suivi des
          erreurs ; le cas échéant, seules les erreurs critiques sont envoyées.
        </p>
      </LegalSection>

      <LegalSection id="position" title="Votre position (géolocalisation)">
        <p>
          Lorsque vous utilisez les fonctionnalités de localisation ou de guidage, l'application peut
          utiliser votre position afin de déterminer votre position sur la carte et faciliter la navigation.
          <strong> Votre position est utilisée pour vous localiser sur le campus et vous guider vers une destination.</strong>
        </p>
        <ul>
          <li>Votre navigateur vous demande toujours l'autorisation avant de partager votre position. Vous pouvez refuser ou la retirer à tout moment dans les réglages du navigateur.</li>
          <li>Si vous refusez, la carte continue de fonctionner : vous pouvez choisir manuellement votre point de départ.</li>
          <li>La position est traitée dans votre navigateur (affichage, calcul de l'itinéraire, détection d'un écart). <strong>L'application ne l'envoie pas dans sa base de données et n'en conserve pas d'historique.</strong></li>
          <li>Même sans votre position, la carte affichée charge des fonds de carte et des lieux d'intérêt pour la zone visible : ces services reçoivent la zone demandée. Si la carte est centrée sur vous, cette zone peut indirectement correspondre à votre voisinage (voir « Services tiers »).</li>
        </ul>
      </LegalSection>

      <LegalSection id="stockage" title="Stockage et durée de conservation">
        <ul>
          <li>
            <strong>Sur votre appareil :</strong> préférences, état de la session de connexion, quelques
            indicateurs d'interface et, pour l'usage hors ligne, une copie temporaire des données publiques
            du campus et des photos consultées. Détail sur {link('/cookies', 'la page cookies')}.
          </li>
          <li>
            <strong>Dans la base de données (Supabase) :</strong> les données de votre compte listées
            ci-dessus, protégées par des règles d'accès qui limitent chaque utilisateur à ses propres
            données.
          </li>
          <li>
            <strong>Durée :</strong> aucune suppression automatique n'est programmée à ce jour : vos données
            de compte sont conservées tant que le compte existe. Selon la structure de la base, la
            suppression d'un compte supprime en même temps son profil, ses favoris, son historique, ses
            paramètres, ses notifications, ses réservations et ses signalements. Les durées de conservation
            définitives doivent être fixées par l'établissement.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="tiers" title="Services tiers utilisés">
        <p>
          Voici les services que le code contacte réellement, et leur rôle. Nous ne décrivons pas leurs
          pratiques internes : consultez leurs propres politiques.
        </p>
        <DataTable
          headers={['Service', 'Rôle', 'Ce que le code lui envoie']}
          rows={[
            ['Supabase', 'Authentification, base de données, stockage des photos.', 'Vos requêtes de données ; les informations de compte si vous êtes connecté.'],
            ['MapTiler (ou autre fournisseur de carte configuré : Mapbox, Esri)', 'Fonds de carte (plan, satellite, relief…).', 'Requêtes de tuiles pour la zone affichée, avec la clé d’accès de l’application.'],
            ['OpenStreetMap', 'Fonds de carte de secours ; données des lieux d’intérêt.', 'Requêtes de tuiles pour la zone affichée.'],
            ['Overpass API', 'Lieux d’intérêt proches (commerces, services…).', 'Les limites géographiques de la zone de carte visible, sans identifiant de compte.'],
            ['Google Fonts', 'Polices de caractères de l’interface.', 'Une requête de chargement des polices (adresse IP et informations de navigateur inhérentes).'],
            ['Google, GitHub', 'Connexion, uniquement si vous choisissez ces boutons.', 'Vous êtes redirigé vers le fournisseur, selon son fonctionnement.'],
          ]}
        />
      </LegalSection>

      <LegalSection id="securite" title="Sécurité">
        <ul>
          <li>Les échanges avec l'application se font en HTTPS lorsque l'hébergement le fournit.</li>
          <li>Des règles d'accès (RLS) sont définies dans la base pour que chaque utilisateur ne lise et ne modifie que ses propres favoris, historique, notifications, réservations, signalements et paramètres.</li>
          <li>Aucune clé secrète d'administration n'est incluse dans l'application côté navigateur.</li>
          <li>Les données privées ne sont pas mises en cache par la copie hors ligne de l'application.</li>
        </ul>
        <Callout tone="warn">
          Aucun système n'est infaillible : nous ne pouvons pas promettre une sécurité absolue. Utilisez un
          mot de passe unique et déconnectez-vous sur un appareil partagé.
        </Callout>
      </LegalSection>

      <LegalSection id="droits" title="Vos droits et vos choix">
        <ul>
          <li><strong>Consulter et récupérer vos données :</strong> {link('/settings', 'Paramètres', { section: 'privacy' })} → « Mes données » (affichage et téléchargement de vos données de compte).</li>
          <li><strong>Effacer votre historique de recherche</strong> et refuser son enregistrement : même endroit.</li>
          <li><strong>Retirer vos favoris</strong> depuis la page Favoris ; <strong>annuler une réservation</strong> depuis la page Réservations.</li>
          <li><strong>Retirer l'accès à votre position</strong> : réglages de votre navigateur.</li>
          <li>
            <strong>Supprimer votre compte, corriger ou vous opposer à un traitement :</strong> l'application
            n'a pas de bouton de suppression automatique de compte. Faites-en la demande à
            l'administration (coordonnées ci-dessous) en précisant l'adresse e-mail du compte ; la
            suppression du compte entraîne celle des données qui y sont rattachées.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <ContactBlock />
        <p>Cette politique peut évoluer ; la date de mise à jour figure en haut de la page.</p>
      </LegalSection>
    </LegalLayout>
  );
}
