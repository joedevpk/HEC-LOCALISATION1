// Outils PURS (sans réseau) du script `npm run probe:imagery`.
// Objectif : distinguer le zoom AUTORISÉ par le code du niveau de détail RÉELLEMENT fourni par
// l'imagerie. Un fournisseur peut servir des tuiles au zoom 20 qui ne sont que le zoom 17
// agrandi : elles existent (HTTP 200) mais ne contiennent pas plus de détail.

/** Indices de tuile XYZ (« slippy map ») d'un point. */
export function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lat < -85.0511 || lat > 85.0511 || lng < -180 || lng > 180) {
    throw new RangeError('Coordonnées hors de la projection Web Mercator.');
  }
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** Les 4 tuiles enfants (zoom z+1) d'une tuile (z, x, y). */
export function childTiles(z: number, x: number, y: number): Array<{ z: number; x: number; y: number }> {
  return [0, 1].flatMap((dy) => [0, 1].map((dx) => ({ z: z + 1, x: 2 * x + dx, y: 2 * y + dy })));
}

export type DetailVerdict = 'native' | 'upscaled' | 'undetermined';

/**
 * HEURISTIQUE (non calibrée sur des tuiles réelles) fondée sur le poids des fichiers JPEG :
 * si le zoom z+1 apporte de l'information nouvelle, la somme des 4 tuiles enfants pèse environ
 * 4× la tuile parente ; si elles ne sont que l'agrandissement du parent, elles sont lissées
 * donc nettement plus légères. Le verdict ne remplace JAMAIS un contrôle visuel sur le campus.
 */
export function assessDetailGain(parentBytes: number, childBytes: number[]): { ratio: number; verdict: DetailVerdict } {
  if (!(parentBytes > 0) || childBytes.length !== 4 || childBytes.some((b) => !(b > 0))) {
    throw new RangeError('Tailles de tuiles invalides (4 enfants et un parent non vides requis).');
  }
  const ratio = childBytes.reduce((a, b) => a + b, 0) / parentBytes;
  if (ratio >= 3.2) return { ratio, verdict: 'native' };
  if (ratio <= 2.4) return { ratio, verdict: 'upscaled' };
  return { ratio, verdict: 'undetermined' };
}
