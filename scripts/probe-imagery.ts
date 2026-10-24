/* Sonde de l'imagerie satellite réellement servie autour d'un point (LECTURE SEULE).
 *
 *   VITE_MAP_API_KEY=... npm run probe:imagery -- --lng <longitude> --lat <latitude> [--zmin 15] [--zmax 20]
 *
 * Aucune coordonnée par défaut : donnez celles du campus (Supabase / relevé terrain).
 * Fournisseur : MapTiler (tuileset `satellite-v2`) par défaut. Autre fournisseur :
 *   IMAGERY_TILE_URL='https://exemple/{z}/{x}/{y}.jpg?key={key}'
 * La clé n'est jamais affichée. Résultat = heuristique : à confirmer visuellement sur place.
 */
import { assessDetailGain, childTiles, lngLatToTile } from '../src/lib/imagery-probe';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const key = process.env.VITE_MAP_API_KEY;
const lng = Number(arg('lng'));
const lat = Number(arg('lat'));
const zmin = Number(arg('zmin') ?? 15);
const zmax = Number(arg('zmax') ?? 20);
if (!key) {
  console.error('VITE_MAP_API_KEY est requis (variable d’environnement, jamais dans le dépôt).');
  process.exit(2);
}
if (arg('lng') === undefined || arg('lat') === undefined || !Number.isFinite(lng) || !Number.isFinite(lat)) {
  console.error('--lng et --lat sont requis (aucune position par défaut : ne jamais inventer le campus).');
  process.exit(2);
}
const template = process.env.IMAGERY_TILE_URL ?? 'https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key={key}';
const url = (z: number, x: number, y: number) =>
  template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)).replace('{key}', key);

async function tileSize(z: number, x: number, y: number): Promise<{ status: number; bytes: number }> {
  try {
    const res = await fetch(url(z, x, y), { signal: AbortSignal.timeout(15_000) });
    const buf = await res.arrayBuffer();
    return { status: res.status, bytes: res.ok ? buf.byteLength : 0 };
  } catch {
    return { status: 0, bytes: 0 };
  }
}

console.log(`Sonde d’imagerie autour de ${lat}, ${lng} (zoom ${zmin}→${zmax}). Clé non affichée.`);
let failures = 0;
for (let z = zmin; z < zmax; z++) {
  const { x, y } = lngLatToTile(lng, lat, z);
  const parent = await tileSize(z, x, y);
  const kids = await Promise.all(childTiles(z, x, y).map((c) => tileSize(c.z, c.x, c.y)));
  if (parent.status !== 200 || kids.some((k) => k.status !== 200)) {
    failures++;
    console.log(`z${z}→z${z + 1} : tuile indisponible (parent HTTP ${parent.status}, enfants ${kids.map((k) => k.status).join('/')}).`);
    continue;
  }
  const { ratio, verdict } = assessDetailGain(parent.bytes, kids.map((k) => k.bytes));
  const label = { native: 'détail supplémentaire probable', upscaled: 'AGRANDISSEMENT probable (pas de vrai détail)', undetermined: 'indéterminé' }[verdict];
  console.log(`z${z}→z${z + 1} : poids enfants/parent ×${ratio.toFixed(2)} → ${label}`);
}
console.log('\nHeuristique sur le poids des fichiers : confirmez en regardant la carte sur le campus.');
process.exit(failures > 0 ? 1 : 0);
