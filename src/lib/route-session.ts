/* ============================================================================
 * route-session.ts — règles pures de cohérence entre un itinéraire affiché et
 * la destination demandée (aucune dépendance React : testable seul).
 *
 * Problèmes corrigés (audit MapPage) :
 *  - un nouveau calcul externe effaçait aussitôt le tracé valide ;
 *  - un échec (quota, réseau…) effaçait un tracé valide de la MÊME destination ;
 *  - rien ne liait un tracé à la destination pour laquelle il avait été calculé,
 *    un résultat pouvait donc rester affiché pour une autre destination.
 * ========================================================================= */
import { haversine, type RouteResult } from '@/lib/nav';

/** Un départ qui a bougé de moins que ceci (bruit GPS) reste « le même départ ». */
export const SAME_ORIGIN_TOLERANCE_M = 40;

export function sameOrigin(a: [number, number], b: [number, number], tolM = SAME_ORIGIN_TOLERANCE_M): boolean {
  return haversine(a, b) < tolM;
}

export interface RouteTag {
  destId: string;
  origin: [number, number];
}

/** Le tracé n'est affichable que s'il a été calculé pour la destination courante. */
export function routeForDestination(
  route: RouteResult | null,
  tag: RouteTag | null,
  selectedId: string | null | undefined,
): RouteResult | null {
  if (!route || !tag || !selectedId) return null;
  return tag.destId === selectedId ? route : null;
}

export type RecomputeDecision =
  /** Garder le tracé affiché (même destination), le temps du nouveau calcul. */
  | 'keep-previous'
  /** Autre destination : ne jamais montrer l'ancien tracé. */
  | 'clear';

/** Le tracé précédent n'est conservé que pour le MÊME couple départ-destination. */
export function decideOnRecompute(
  tag: RouteTag | null,
  nextDestId: string,
  nextOrigin: [number, number],
): RecomputeDecision {
  return tag && tag.destId === nextDestId && sameOrigin(tag.origin, nextOrigin) ? 'keep-previous' : 'clear';
}

/** Après un échec de recalcul : on conserve un tracé valide de la même destination, sinon on l'efface. */
export function decideOnFailure(
  tag: RouteTag | null,
  destId: string,
  origin: [number, number],
): 'keep-previous-with-warning' | 'show-error' {
  return tag && tag.destId === destId && sameOrigin(tag.origin, origin) ? 'keep-previous-with-warning' : 'show-error';
}

export function staleRouteWarning(reason: string): string {
  return `Mise à jour de l’itinéraire impossible : ${reason} Le tracé affiché reste celui du dernier calcul réussi pour ce trajet.`;
}
