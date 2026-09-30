// ---------------------------------------------------------------------
// Couche centrale de validation géographique de l'application.
//
// RÈGLE DE NOMMAGE (pour ne jamais inverser lat/lng silencieusement) :
// - Les fonctions de VALIDATION/MÉTIER (isValidLatitude, isValidLongitude,
//   isValidCoordinates, validateCoordinates, assertValidCoordinates,
//   getCoordinateErrorCode, calculateDistance, calculateBearing,
//   calculateBounds, calculateCenter) prennent toujours (lat, lng), dans
//   cet ordre — c'est l'ordre "naturel" utilisé partout ailleurs dans
//   l'app (formulaires, Supabase, `CampusLocation.lat`/`.lng`, etc.).
// - Les fonctions de CONVERSION (toLngLat, toLatLng) prennent leurs
//   paramètres dans l'ordre indiqué par leur propre nom : `toLngLat(lng, lat)`
//   produit un tuple `[lng, lat]` (ordre MapLibre / GeoJSON), `toLatLng(lat, lng)`
//   produit un objet `{ lat, lng }`. Le nom de la fonction = l'ordre des
//   paramètres = l'ordre de sortie.
//
// ÉTAPE 39 du cahier des charges : ne jamais enregistrer 0,0 ou une
// position hors des bornes géographiques valides.
//
// IMPORTANT — validation géographique ≠ validation métier :
// (0, 0) est une coordonnée géographiquement valide (elle existe sur
// Terre). `isValidCoordinates` (pure, géographique) l'accepte donc.
// C'est `isNullIsland` / `validateCoordinates` (métier, propre à cette
// application) qui la rejette explicitement comme "position jamais
// définie". Ne pas fusionner ces deux niveaux.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Validation géographique pure
// ---------------------------------------------------------------------

/** Rejette null, undefined, NaN, Infinity, chaînes et toute valeur hors
 * [-90, 90]. Le type predicate permet à TypeScript de resserrer le type
 * de l'appelant à `number` juste après un appel réussi. */
export function isValidLatitude(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
}

/** Même contrat que `isValidLatitude`, pour l'intervalle [-180, 180]. */
export function isValidLongitude(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;
}

/** Validation géographique pure de la paire (lat, lng) : est-ce une
 * position possible sur Terre ? Ne contient AUCUNE règle métier — voir
 * `validateCoordinates` pour la version qui rejette aussi (0, 0). */
export function isValidCoordinates(lat: unknown, lng: unknown): boolean {
  return isValidLatitude(lat) && isValidLongitude(lng);
}

/** "Null Island" (0, 0) : quasiment toujours le signe d'un point jamais
 * réellement positionné (valeur par défaut oubliée dans un formulaire). */
export function isNullIsland(lat: number, lng: number): boolean {
  return lat === 0 && lng === 0;
}

// ---------------------------------------------------------------------
// Erreurs explicites
// ---------------------------------------------------------------------

export type GeoValidationErrorCode =
  | 'INVALID_LATITUDE'
  | 'INVALID_LONGITUDE'
  | 'INVALID_COORDINATES';

/**
 * Variante "programmatique" de `validateCoordinates` : renvoie un code
 * d'erreur stable plutôt qu'un message déjà traduit en français — utile
 * pour de l'i18n futur ou un traitement par `switch` côté appelant.
 * `validateCoordinates` reste inchangée pour ne pas casser les
 * appelants existants qui affichent directement son message.
 */
export function getCoordinateErrorCode(lat: unknown, lng: unknown): GeoValidationErrorCode | null {
  if (!isValidLatitude(lat)) return 'INVALID_LATITUDE';
  if (!isValidLongitude(lng)) return 'INVALID_LONGITUDE';
  if (isNullIsland(lat, lng)) return 'INVALID_COORDINATES';
  return null;
}

// ---------------------------------------------------------------------
// Validation métier (messages FR, utilisée par les formulaires / api.ts)
// — comportement inchangé par rapport à la version précédente.
// ---------------------------------------------------------------------

/**
 * Renvoie un message d'erreur en français si les coordonnées ne sont pas
 * valides, sinon `null`. Utilisé côté formulaires pour afficher une
 * erreur contrôlée avant même d'appeler l'API.
 */
export function validateCoordinates(lat: unknown, lng: unknown): string | null {
  if (!isValidLatitude(lat)) {
    return `Latitude invalide (${String(lat)}) : doit être comprise entre -90 et 90.`;
  }
  if (!isValidLongitude(lng)) {
    return `Longitude invalide (${String(lng)}) : doit être comprise entre -180 et 180.`;
  }
  if (isNullIsland(lat, lng)) {
    return "Position non définie : cliquez sur la carte pour placer le point avant d'enregistrer.";
  }
  return null;
}

/** Variante qui lève une exception — utilisée dans `api.ts` comme dernier
 * garde-fou juste avant l'insertion/mise à jour en base, même si un appelant
 * a oublié de valider côté formulaire. */
export function assertValidCoordinates(lat: unknown, lng: unknown): void {
  const error = validateCoordinates(lat, lng);
  if (error) throw new Error(error);
}

// ---------------------------------------------------------------------
// Conversions — voir la règle de nommage en tête de fichier.
// ---------------------------------------------------------------------

/**
 * Garde-fou de dernier recours côté carte (ÉTAPE 7-8 du cahier des charges) :
 * même si `assertValidCoordinates` empêche en théorie toute coordonnée
 * invalide d'entrer en base, une ligne existante avant l'ajout de ce
 * contrôle, ou modifiée directement en SQL, pourrait encore en contenir
 * une. `toLngLat` ne lève jamais — elle renvoie `null` et journalise
 * l'anomalie, pour qu'un seul marqueur invalide ne fasse jamais planter
 * MapLibre (et donc la carte entière) : l'appelant doit alors ignorer ce
 * point plutôt que de l'envoyer à `setLngLat`/`flyTo`/`easeTo`.
 */
export function toLngLat(lng: unknown, lat: unknown): [number, number] | null {
  const longitude = Number(lng);
  const latitude = Number(lat);
  if (!isValidLongitude(longitude) || !isValidLatitude(latitude)) {
    console.error('[geo-validation] Coordonnées invalides ignorées :', { lng, lat });
    return null;
  }
  return [longitude, latitude];
}

/** Inverse de `toLngLat` : produit un objet `{ lat, lng }` plutôt qu'un
 * tuple. Même contrat (ne lève jamais, `null` + log en cas de valeur
 * invalide) — pratique quand le consommateur préfère un objet nommé
 * (props de composant, formulaire) à un tuple positionnel. */
export function toLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    console.error('[geo-validation] Coordonnées invalides ignorées :', {
      lat,
      lng,
    });
    return null;
  }

  return {
    lat: latitude,
    lng: longitude,
  };
}

// ---------------------------------------------------------------------
// NOTE : le système GeoFix / AccuracyTier / classifyAccuracy / isBetterFix
// / isTrustworthy vit exclusivement dans `lib/geolocation.ts` (RÈGLE
// ABSOLUE du projet : un seul système de fiabilité GPS). Ce fichier ne
// gère que la validation géographique pure/métier et les conversions
// lat/lng ci-dessus — il ne doit plus jamais redéfinir de second système
// GPS parallèle, même partiellement, pour ne pas risquer une divergence
// silencieuse entre deux verdicts de précision.
// ---------------------------------------------------------------------