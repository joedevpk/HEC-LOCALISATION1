/* Audit LECTURE SEULE des données géographiques du campus.
 *
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run audit:data
 *
 * N'écrit rien, ne corrige rien. Utilise la clé publique (anon) : il voit donc
 * exactement ce que voit le public. Les lignes archivées ne sont pas auditées.
 * Rayon d'alerte modifiable : AUDIT_MAX_RADIUS_M (défaut 1500 m).
 */
import { createClient } from '@supabase/supabase-js';
import { auditCampusData, formatAuditReport } from '../src/lib/campus-audit';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont requis (aucune valeur par défaut).');
  process.exit(2);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function all<T>(table: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw new Error(`${table} : ${error.message}`);
  return (data ?? []) as T[];
}

const campuses = await all<{ id: string; center_lat: number; center_lng: number }>('campuses');
if (campuses.length === 0) {
  console.error('Aucun campus lisible (table vide ou accès refusé par RLS).');
  process.exit(1);
}
const [buildings, locations, nodes, segments] = await Promise.all([
  all<never>('buildings'),
  all<never>('locations'),
  all<never>('route_nodes'),
  all<never>('route_segments'),
]);
const radius = Number(process.env.AUDIT_MAX_RADIUS_M) || undefined;
const findings = auditCampusData(
  { campus: campuses[0], buildings, locations, nodes, segments },
  { maxRadiusM: radius },
);
console.log(`Campus audité : ${campuses[0].id} — ${buildings.length} bâtiments, ${locations.length} lieux, ${nodes.length} nœuds, ${segments.length} segments (archivés inclus dans ces totaux).`);
console.log(formatAuditReport(findings));
process.exit(findings.some((f) => f.severity === 'critique') ? 1 : 0);
