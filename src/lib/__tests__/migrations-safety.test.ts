import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const dir = 'supabase/supabase/migrations/';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const read = (f: string) => readFileSync(dir + f, 'utf8');
const NEW = ['20261026090000_data_provenance_columns.sql', '20261027090000_institutional_governance.sql'];
// Retire les commentaires SQL pour ne pas confondre une explication avec une instruction.
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

describe('migrations correctives (analyse statique — la preuve d’exécution est supabase/tests/run_local.sh)', () => {
  it.each(NEW)('%s : aucune instruction destructive', (f) => {
    const c = code(f);
    expect(c).not.toMatch(/\bDROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)\b/i);
    expect(c).not.toMatch(/\bTRUNCATE\b/i);
    expect(c).not.toMatch(/\bDELETE\s+FROM\s+(buildings|locations|floors|building_images|location_images|audit_log)/i);
  });
  it('les migrations ont des horodatages uniques et croissants', () => {
    const stamps = files.map((f) => f.split('_')[0]);
    expect(new Set(stamps).size).toBe(stamps.length);
    expect([...stamps].sort()).toEqual(stamps);
  });
  it('la migration de gouvernance suit celle de provenance (colonnes utilisées par import_campus_data)', () => {
    expect(files.indexOf(NEW[1])).toBeGreaterThan(files.indexOf(NEW[0]));
    expect(code(NEW[1])).toContain('data_source');
  });
  it('gouvernance : journal append-only, validateur, RLS des archives, stockage contraint, import protégé', () => {
    const c = code(NEW[1]);
    expect(c).toMatch(/ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY/);
    expect(c).toMatch(/REVOKE ALL ON audit_log FROM anon, authenticated/);
    expect(c).not.toMatch(/CREATE POLICY[^;]+ON audit_log FOR (INSERT|UPDATE|DELETE)/);
    expect(c).toMatch(/is_data_validator\(\)/);
    expect(c).toMatch(/archived_at IS NULL OR is_campus_admin\(\)/);
    expect(c).toMatch(/building-images[\s\S]*?\[0-9a-f\]\{8\}/);
    expect(c).toMatch(/REVOKE EXECUTE ON FUNCTION import_campus_data\(jsonb\) FROM PUBLIC, anon/);
    expect(c).toMatch(/SECURITY INVOKER/);
  });
  it('les fonctions SECURITY DEFINER fixent search_path', () => {
    for (const f of NEW) {
      const c = code(f);
      for (const m of c.matchAll(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;?/g)) {
        if (/SECURITY DEFINER/i.test(m[0])) expect(m[0]).toMatch(/SET search_path/i);
      }
    }
  });
  it('constat d’audit : la migration de seed (données de démo) est dans la chaîne et dépend d’un campus existant', () => {
    const seed = read('20260903100000_seed_example_building_and_room.sql');
    expect(seed).toMatch(/Aucun campus trouvé/);
  });
  it('le script de test exécuté sur PostgreSQL existe et couvre rôles, audit, import et stockage', () => {
    const t = readFileSync('supabase/tests/10_permissions.sql', 'utf8');
    for (const k of ['étudiant', 'gestionnaire', 'admin', 'audit', 'import', 'storage.objects']) expect(t).toContain(k);
  });
});
