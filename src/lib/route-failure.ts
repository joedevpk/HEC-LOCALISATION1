/**
 * Présentation des échecs de calcul d'itinéraire piéton.
 *
 * Six états distincts, jamais confondus et jamais remplacés par un tracé fictif :
 *   calculé · recalcul en cours · indisponible · erreur réseau · erreur de configuration · destination introuvable.
 * (« calculé » et « recalcul » sont gérés par RoutePanel ; ce module couvre les échecs.)
 */
import type { WalkingRouteErrorKind } from '@/lib/walking-route';

export type RouteFailureCategory =
  | 'network' // coupure / délai : réessayer a du sens
  | 'unavailable' // service ou fournisseur en panne / quota : réessayer plus tard
  | 'configuration' // non configuré, jeton/origine refusé, requête mal formée : action d'un administrateur
  | 'not_found' // aucun chemin / hors zone / trop loin : changer de départ ou de destination
  | 'campus_network' // réseau piéton interne du campus absent ou incomplet
  | 'generic';

export interface RouteFailureView {
  category: RouteFailureCategory;
  title: string;
  /** Un bouton « Réessayer » est pertinent (la même requête peut réussir). */
  retryable: boolean;
  /** Indication d'action courte, affichée sous le message. */
  hint: string;
}

export function describeRouteFailure(kind: WalkingRouteErrorKind | 'campus_network' | undefined): RouteFailureView {
  switch (kind) {
    case 'network_error':
    case 'timeout':
      return { category: 'network', title: 'Erreur réseau', retryable: true, hint: 'Vérifiez votre connexion puis réessayez.' };
    case 'service_unavailable':
    case 'invalid_response':
    case 'rate_limited':
      return { category: 'unavailable', title: 'Itinéraire momentanément indisponible', retryable: true, hint: 'Réessayez dans un instant.' };
    case 'not_configured':
    case 'forbidden':
    case 'bad_request':
      // Côté visiteur : aucun jargon, une piste d'action réelle (le départ « lieu du campus » utilise le
      // réseau interne, indépendant du service externe). Le détail technique reste réservé aux administrateurs
      // (voir userFacingRouteMessage).
      return {
        category: 'configuration',
        title: 'Itinéraire pas encore disponible ici',
        retryable: false,
        hint: 'Ce n’est pas un problème de votre appareil. Choisissez un lieu du campus comme point de départ ci-dessous, ou revenez plus tard.',
      };
    case 'no_route':
    case 'out_of_area':
    case 'too_far':
    case 'invalid_points':
      return { category: 'not_found', title: 'Aucun itinéraire piéton trouvé', retryable: false, hint: 'Essayez un autre point de départ ou une autre destination.' };
    case 'campus_network':
      return { category: 'campus_network', title: 'Réseau piéton du campus incomplet', retryable: false, hint: 'Cette zone doit être configurée par l’administration.' };
    default:
      return { category: 'generic', title: 'Itinéraire indisponible', retryable: true, hint: 'Réessayez ou choisissez un autre départ.' };
  }
}

/** Phrase affichée aux visiteurs pour un échec de configuration (le détail technique ne les concerne pas). */
export const CONFIGURATION_FAILURE_PUBLIC_MESSAGE =
  'Le calcul d’itinéraire depuis cette position n’est pas disponible pour le moment.';

/**
 * Message sous le titre de l'échec. Un échec de configuration (service non déployé, jeton ou origine refusés…)
 * est un sujet d'administrateur : le visiteur reçoit une phrase claire, l'administrateur garde le message technique
 * exact (et la piste de correction). Les autres catégories (réseau, indisponible, introuvable) sont déjà rédigées
 * pour l'utilisateur et passent telles quelles.
 */
export function userFacingRouteMessage(view: RouteFailureView | null, technicalMessage: string, isAdmin: boolean): string {
  if (!view || view.category !== 'configuration') return technicalMessage;
  return isAdmin ? `${technicalMessage} (Administrateur : voir docs/ROUTING_PROXY.md.)` : CONFIGURATION_FAILURE_PUBLIC_MESSAGE;
}
