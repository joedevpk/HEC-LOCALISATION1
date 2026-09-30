// src/lib/geolocation.ts
// ---------------------------------------------------------------------
// Positionnement GPS en direct ("Me guider").
//
// Ce fichier expose tout ce dont dépendent MapPage (suivi de position en
// continu, hors du contrôle natif MapLibre) et CampusMap (palier de
// fiabilité utilisé par le GeolocateControl natif) — RÈGLE ABSOLUE : un
// seul système de calcul de fiabilité GPS, partagé par les deux, pour ne
// jamais afficher deux verdicts différents sur la même lecture.
//
// La validation des coordonnées brutes (bornes lat/lng) réutilise
// `geo-validation.ts` plutôt que de la dupliquer.
// ---------------------------------------------------------------------

import { isValidLatitude, isValidLongitude } from '@/lib/geo-validation';

/** Fiabilité d'une lecture GPS, dérivée de sa précision (`accuracy`, en
 * mètres) : `precise` (≤ `PRECISE_ACCURACY_METERS`), `approximate`
 * (≤ `IMPRECISE_ACCURACY_METERS`), sinon `unreliable`. */
export type AccuracyTier = 'precise' | 'approximate' | 'unreliable';

/** ≤ ce seuil (mètres) : position exploitable pour une navigation
 * normale/un itinéraire précis. Exportée pour que l'UI (ex. le bandeau
 * d'avertissement d'itinéraire) réutilise exactement le même seuil que
 * `classifyAccuracy`, plutôt que de dupliquer la valeur `100`. */
export const PRECISE_ACCURACY_METERS = 100;
/** > ce seuil (mètres) : position trop imprécise pour une navigation
 * précise (ex. IP/Wi-Fi sur PC sans puce GPS) — reste affichable comme
 * position approximative, mais ne doit jamais servir de base à un
 * itinéraire présenté comme précis. */
export const IMPRECISE_ACCURACY_METERS = 1000;
/** Au-delà de cet âge, une lecture n'est plus considérée comme
 * exploitable pour afficher "Ma position" ou guider un itinéraire. */
const MAX_FIX_AGE_MS = 30_000;

/** Classe une précision GPS (en mètres) en palier de fiabilité. Seule
 * implémentation du calcul de palier — réutilisée à la fois par
 * `toGeoFix` (suivi continu de MapPage) et par le `GeolocateControl`
 * natif de CampusMap, pour ne jamais dupliquer les seuils
 * `PRECISE_ACCURACY_METERS` / `IMPRECISE_ACCURACY_METERS`. */
export function classifyAccuracy(accuracyMeters: number): AccuracyTier {
  if (accuracyMeters <= PRECISE_ACCURACY_METERS) return 'precise';
  if (accuracyMeters <= IMPRECISE_ACCURACY_METERS) return 'approximate';
  return 'unreliable';
}

/** Message unique affiché quand la précision GPS est faible (jamais une
 * précision inventée : voir `formatAccuracy` pour la valeur réelle). */
export const LOW_ACCURACY_HINT =
  'Précision GPS faible — déplacement vers une zone dégagée recommandé.';

/** Libellés lisibles associés à chaque `AccuracyTier`, pour l'affichage
 * UI (badge de précision, panneau "Ma position"). */
export const accuracyTierLabels: Record<AccuracyTier, string> = {
  precise: 'Précise',
  approximate: 'Approximative',
  unreliable: 'Imprécise',
};

/** Formatte une précision GPS en mètres pour l'affichage ("±15 m",
 * "±1.2 km" au-delà de 1000 m). */
export function formatAccuracy(accuracyMeters: number): string {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters < 0) return '±? m';
  if (accuracyMeters < 1000) return `±${Math.round(accuracyMeters)} m`;
  return `±${(accuracyMeters / 1000).toFixed(1)} km`;
}

/** Une lecture de position GPS validée et horodatée. `lat`/`lng` suivent
 * la convention métier de l'app (jamais inversés), `accuracy` est en
 * mètres, `timestamp` en millisecondes epoch. `heading`/`speed` sont
 * transmis tels quels par le capteur (jamais inventés) : `null` quand le
 * device ne les fournit pas (immobile, pas de magnétomètre...). */
export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  tier: AccuracyTier;
}

/**
 * Construit un `GeoFix` à partir d'une `GeolocationPosition` brute du
 * navigateur. Ne lève jamais : renvoie `null` + log si les coordonnées ou
 * la précision sont invalides, pour qu'une lecture aberrante du capteur
 * ne fasse jamais planter le suivi de position.
 */
export function toGeoFix(position: GeolocationPosition): GeoFix | null {
  const { latitude, longitude, accuracy, heading, speed } = position.coords;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    console.error('[geolocation] GeoFix ignoré : coordonnées invalides :', { latitude, longitude });
    return null;
  }
  if (!Number.isFinite(accuracy) || accuracy < 0) {
    console.error('[geolocation] GeoFix ignoré : précision invalide :', { accuracy });
    return null;
  }
  return {
    lat: latitude,
    lng: longitude,
    accuracy,
    heading: heading ?? null,
    speed: speed ?? null,
    timestamp: position.timestamp,
    tier: classifyAccuracy(accuracy),
  };
}

const ACCURACY_TIER_RANK: Record<AccuracyTier, number> = {
  precise: 2,
  approximate: 1,
  unreliable: 0,
};

/** Au-delà de cet âge, une position actuelle "fiable" peut être remplacée
 * même par une lecture de moindre palier : mieux vaut une position
 * récente approximative qu'une position précise mais périmée. */
const DEGRADED_REPLACE_AFTER_MS = 20_000;

/**
 * Décide si `candidate` doit remplacer `current` comme position
 * affichée.
 *
 * - Une lecture plus ancienne que la position actuelle ne la remplace
 *   jamais.
 * - Un meilleur palier de précision l'emporte toujours.
 * - À palier ÉGAL, la lecture la plus récente l'emporte : un utilisateur
 *   qui marche doit voir sa position avancer, même si la lecture
 *   précédente était un peu plus précise (l'ancienne règle "la plus
 *   précise gagne" figeait la position sur le meilleur fix jamais reçu).
 *   À horodatage identique, seule une meilleure précision remplace.
 * - Un palier INFÉRIEUR ne remplace une position encore fraîche jamais
 *   (cas "RDC affiché en Belgique") ; il ne la remplace que lorsqu'elle
 *   est devenue périmée (`DEGRADED_REPLACE_AFTER_MS`).
 * - `current === null` accepte toujours `candidate` (première lecture).
 */
export function isBetterFix(candidate: GeoFix, current: GeoFix | null): boolean {
  if (!current) return true;
  if (candidate.timestamp < current.timestamp) return false;
  const candidateRank = ACCURACY_TIER_RANK[candidate.tier];
  const currentRank = ACCURACY_TIER_RANK[current.tier];
  if (candidateRank > currentRank) return true;
  if (candidateRank === currentRank) {
    if (candidate.timestamp > current.timestamp) return true;
    return candidate.accuracy < current.accuracy;
  }
  return candidate.timestamp - current.timestamp > DEGRADED_REPLACE_AFTER_MS;
}

/**
 * Une lecture est exploitable si elle n'est ni trop imprécise
 * (`unreliable`) ni trop ancienne (`MAX_FIX_AGE_MS`). `referenceTimestamp`
 * est injectable pour les tests, sinon `Date.now()`.
 */
export function isTrustworthy(fix: GeoFix, referenceTimestamp: number = Date.now()): boolean {
  if (fix.tier === 'unreliable') return false;
  return referenceTimestamp - fix.timestamp <= MAX_FIX_AGE_MS;
}

/**
 * Un fix est exploitable pour PRÉSENTER un itinéraire comme précis
 * uniquement si sa précision est ≤ `PRECISE_ACCURACY_METERS` (100 m) ET
 * qu'il n'est pas périmé. En dessous de ce niveau (palier `approximate`
 * ou `unreliable`), le point de départ reste utilisable — on ne le
 * remplace jamais par une position fictive — mais l'itinéraire calculé à
 * partir de lui doit être signalé comme approximatif (voir le bandeau
 * d'avertissement de RoutePanel dans MapPage).
 */
export function isPreciseEnoughForRouting(fix: GeoFix): boolean {
  return fix.tier === 'precise' && isTrustworthy(fix);
}

/** État de la permission de géolocalisation renvoyé par
 * `getGeolocationPermissionState`. `'unsupported'` couvre à la fois les
 * navigateurs sans API Permissions et les contextes non sécurisés. */
export type GeolocationPermissionState = PermissionState | 'unsupported';

/**
 * Interroge (sans jamais déclencher de prompt) l'état actuel de la
 * permission de géolocalisation via l'API Permissions du navigateur,
 * quand elle est disponible. Utilisée pour refléter honnêtement un refus
 * déjà connu avant même que l'utilisateur ne clique sur "Ma position" —
 * jamais pour forcer ou contourner une demande de permission. Ne lève
 * jamais : renvoie `'unsupported'` si l'API est absente ou si la requête
 * échoue (Safari desktop, contexte non sécurisé, etc.).
 */
export async function getGeolocationPermissionState(): Promise<GeolocationPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unsupported';
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch {
    return 'unsupported';
  }
}

/**
 * Ouvre un suivi GPS continu (`navigator.geolocation.watchPosition`) et
 * renvoie une fonction d'arrêt (`clearWatch` encapsulé) — MapPage l'appelle
 * au démontage et avant chaque nouvel appel pour ne jamais laisser deux
 * abonnements GPS actifs en parallèle. Si l'API Geolocation n'est pas
 * disponible (navigateur trop ancien, contexte non sécurisé...), on
 * prévient immédiatement via `onError` et on renvoie un no-op.
 */
export function startLocationWatch(
  onFix: (fix: GeoFix) => void,
  onError: (error: GeolocationPositionError) => void,
): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError({
      code: 2,
      message: 'Geolocation API unavailable',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError);
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const fix = toGeoFix(position);
      if (fix) onFix(fix);
    },
    onError,
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
  );

  return () => navigator.geolocation.clearWatch(watchId);
}