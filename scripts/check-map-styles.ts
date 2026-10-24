/* Vérifie, avec VOTRE clé MapTiler, quels identifiants de style répondent (LECTURE SEULE).
 *
 *   VITE_MAP_API_KEY=... npm run check:styles
 *
 * Teste des candidats par mode (anciens « v2 » et nouveaux « v4 »). HTTP 200 = style
 * disponible pour votre compte ; 404 = identifiant inexistant ; 401/403 = clé ou domaine.
 * La clé n'est jamais affichée. Copiez l'identifiant retenu dans VITE_MAP_STYLE_ID_<MODE>.
 */
const key = process.env.VITE_MAP_API_KEY;
if (!key) {
  console.error('VITE_MAP_API_KEY est requis (variable d’environnement, jamais dans le dépôt).');
  process.exit(2);
}
const candidates: Record<string, string[]> = {
  plan: ['streets-v2', 'streets-v4'],
  satellite: ['satellite', 'satellite-v2', 'satellite-v4'],
  hybrid: ['hybrid', 'hybrid-v4'],
  topo: ['topo-v2', 'topo-v4'],
  dark: ['streets-v2-dark', 'streets-v4-dark', 'dataviz-dark', 'dataviz-v4-dark'],
};
let anyFailure = false;
for (const [mode, ids] of Object.entries(candidates)) {
  let okForMode = false;
  for (const id of ids) {
    let line: string;
    try {
      const res = await fetch(`https://api.maptiler.com/maps/${id}/style.json?key=${encodeURIComponent(key)}`, {
        signal: AbortSignal.timeout(15_000),
      });
      const ok = res.ok && ((await res.json()) as { version?: number }).version === 8;
      okForMode ||= ok;
      line = ok ? 'OK (style valide)' : `INDISPONIBLE (HTTP ${res.status})`;
    } catch {
      line = 'ERREUR RÉSEAU';
    }
    console.log(`${mode.padEnd(10)} ${id.padEnd(18)} ${line}`);
  }
  if (!okForMode) anyFailure = true;
}
process.exit(anyFailure ? 1 : 0);
