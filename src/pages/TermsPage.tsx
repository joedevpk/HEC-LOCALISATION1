import { Callout, ContactBlock, LegalLayout, LegalSection, type TocItem } from '@/components/LegalLayout';
import { legalConfig } from '@/lib/legal-config';

const toc: TocItem[] = [
  { id: 'objet', label: 'Objet du service' },
  { id: 'usage', label: 'Utilisation acceptable' },
  { id: 'compte', label: 'Compte utilisateur' },
  { id: 'guidage', label: 'Cartographie et guidage' },
  { id: 'responsabilites', label: 'Responsabilités' },
  { id: 'ip', label: 'Propriété intellectuelle' },
  { id: 'contenu', label: 'Contenu utilisateur' },
  { id: 'suspension', label: 'Suspension' },
  { id: 'evolution', label: 'Évolution du service' },
  { id: 'contact', label: 'Contact' },
];

export function TermsPage() {
  return (
    <LegalLayout
      title="Conditions d'utilisation"
      subtitle="Les règles simples d'utilisation de HEC Localisation."
      toc={toc}
    >
      <LegalSection id="objet" title="Objet du service">
        <p>
          HEC Localisation aide à trouver et à rejoindre les bâtiments, salles, bureaux et services du
          campus de la {legalConfig.institutionName} : carte interactive, recherche, fiches de lieux,
          itinéraires à pied, favoris, événements, annonces, QR codes, réservations et signalements. En
          utilisant l'application, vous acceptez ces conditions.
        </p>
      </LegalSection>

      <LegalSection id="usage" title="Utilisation acceptable">
        <ul>
          <li>Utilisez le service de bonne foi et conformément aux règles du campus et à la loi.</li>
          <li>Ne tentez pas d'accéder à des données ou fonctions auxquelles vous n'avez pas droit, de perturber le service ou de contourner ses protections.</li>
          <li>N'envoyez pas de contenu illicite, injurieux, trompeur ou portant atteinte à la vie privée d'autrui.</li>
          <li>Ne faites pas de signalements ou de réservations abusifs ou fictifs.</li>
        </ul>
      </LegalSection>

      <LegalSection id="compte" title="Compte utilisateur">
        <ul>
          <li>Le compte est facultatif pour consulter la carte et rechercher un lieu.</li>
          <li>Fournissez des informations exactes et gardez votre mot de passe confidentiel ; vous restez responsable de l'usage de votre compte.</li>
          <li>Les droits d'accès dépendent du profil du compte ; les fonctions d'administration sont réservées aux personnes autorisées.</li>
          <li>Pour supprimer votre compte, suivez la procédure décrite dans la <a href="#/privacy">politique de confidentialité</a>.</li>
        </ul>
      </LegalSection>

      <LegalSection id="guidage" title="Précision de la cartographie et limites du guidage">
        <Callout tone="warn" title="Important">
          Les indications de navigation sont fournies à titre indicatif et ne remplacent pas les indications de
          sécurité, les consignes du campus ou les instructions du personnel autorisé.
        </Callout>
        <ul>
          <li>Les itinéraires sont calculés uniquement sur le réseau piéton saisi par l'administration. Si une zone n'est pas encore configurée, l'application l'indique et ne trace aucun chemin.</li>
          <li>La précision du positionnement dépend de votre appareil, de la météo et des lieux (à l'intérieur des bâtiments, le GPS peut être imprécis). L'application affiche la précision reçue et signale quand elle est faible.</li>
          <li>Les informations (noms, emplacements, photos, horaires, événements) peuvent être incomplètes ou changer ; les fonds de carte proviennent de fournisseurs tiers.</li>
          <li>Ne regardez pas votre écran en marchant dans un endroit dangereux ; respectez la signalisation et les zones interdites d'accès.</li>
        </ul>
      </LegalSection>

      <LegalSection id="responsabilites" title="Responsabilités et disponibilité">
        <ul>
          <li>Le service est fourni « en l'état », sans garantie de disponibilité continue : des interruptions (maintenance, panne, réseau, fournisseurs tiers) peuvent survenir.</li>
          <li>L'usage hors ligne est limité aux contenus déjà consultés ; la carte et la localisation nécessitent une connexion.</li>
          <li>Les limites de responsabilité applicables sont celles prévues par la loi ; l'établissement doit confirmer les clauses juridiques exactes (voir les points restant à valider).</li>
        </ul>
      </LegalSection>

      <LegalSection id="ip" title="Propriété intellectuelle">
        <p>
          Les logos, textes, photos et données du campus appartiennent à l'établissement ou à leurs
          auteurs ; les fonds de carte et données cartographiques restent soumis aux licences de leurs
          fournisseurs (voir les mentions d'attribution sur la carte, dont © OpenStreetMap contributors).
          Aucune reproduction n'est autorisée sans accord, sauf usage personnel normal du service.
        </p>
      </LegalSection>

      <LegalSection id="contenu" title="Contenu que vous fournissez">
        <p>
          Les textes que vous saisissez (signalements, motifs de réservation) restent sous votre
          responsabilité. Vous autorisez l'administration à les consulter et à les traiter pour donner
          suite à votre demande. Évitez d'y inscrire des informations sensibles ou concernant des tiers.
        </p>
      </LegalSection>

      <LegalSection id="suspension" title="Suspension en cas de mauvais usage">
        <p>
          En cas d'usage contraire à ces conditions, l'administration peut limiter, suspendre ou supprimer
          un compte, ou retirer un contenu, pour protéger le service et ses utilisateurs.
        </p>
      </LegalSection>

      <LegalSection id="evolution" title="Évolution du service et des conditions">
        <p>
          Le service et ces conditions peuvent évoluer ; la date de dernière mise à jour figure en haut de
          la page. Continuer à utiliser l'application après une mise à jour vaut acceptation de la
          nouvelle version.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <ContactBlock />
      </LegalSection>
    </LegalLayout>
  );
}
