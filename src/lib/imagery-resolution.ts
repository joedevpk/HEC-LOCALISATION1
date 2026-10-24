// Lien entre zoom MapLibre et résolution de l'imagerie (fonctions pures, testées).
//
// Principe : un zoom « autorisé » par le code n'est pas un détail « fourni » par les images.
// Au-delà du zoom natif de l'imagerie, chaque pixel source est étiré sur plusieurs pixels
// d'écran : l'image est plus grande, pas plus détaillée. On ne cherche donc pas à « améliorer »
// la résolution : on mesure l'étirement et, si l'administrateur connaît la résolution native,
// on plafonne le zoom au-delà duquel on ne ferait qu'agrandir des pixels.

/** Circonférence de la Terre à l'équateur (m) / 512 px : MapLibre a un monde de 512 px au zoom 0. */
const METERS_PER_PX_AT_Z0 = 40_075_016.686 / 512;

/** Mètres au sol représentés par un pixel CSS au zoom MapLibre `zoom` et à la latitude `latDeg`. */
export function metersPerCssPixel(zoom: number, latDeg = 0): number {
  if (!Number.isFinite(zoom) || !Number.isFinite(latDeg) || Math.abs(latDeg) > 85) {
    throw new RangeError('Zoom ou latitude invalide.');
  }
  return (METERS_PER_PX_AT_Z0 * Math.cos((latDeg * Math.PI) / 180)) / 2 ** zoom;
}

/** Nombre de pixels d'écran (CSS) occupés par UN pixel de l'imagerie source (1 = net, >1 = étiré). */
export function stretchFactor(zoom: number, nativeMetersPerPixel: number, latDeg = 0): number {
  if (!(nativeMetersPerPixel > 0)) throw new RangeError('Résolution native invalide (mètres/pixel > 0 requis).');
  return nativeMetersPerPixel / metersPerCssPixel(zoom, latDeg);
}

/** Zoom (fractionnaire) auquel un pixel source = un pixel d'écran. */
export function nativeDetailZoom(nativeMetersPerPixel: number, latDeg = 0): number {
  if (!(nativeMetersPerPixel > 0)) throw new RangeError('Résolution native invalide (mètres/pixel > 0 requis).');
  return Math.log2((METERS_PER_PX_AT_Z0 * Math.cos((latDeg * Math.PI) / 180)) / nativeMetersPerPixel);
}

/** Étirement toléré avant de considérer l'image comme « agrandie sans détail » : 1 niveau de zoom = ×2. */
export const TOLERATED_STRETCH_LEVELS = 1;

/**
 * Zoom maximal raisonnable pour une imagerie de résolution native donnée : le zoom natif plus
 * `TOLERATED_STRETCH_LEVELS`, arrondi vers le bas, borné à [5, ceiling].
 */
export function usefulMaxZoom(nativeMetersPerPixel: number, ceiling: number, latDeg = 0): number {
  const z = Math.floor(nativeDetailZoom(nativeMetersPerPixel, latDeg) + TOLERATED_STRETCH_LEVELS);
  return Math.max(5, Math.min(ceiling, z));
}
