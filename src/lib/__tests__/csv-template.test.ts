import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CSV_COLUMNS, csvTemplate, parseCsv, validateImport, type ImportContext } from '../csv-import';

const ctx = (): ImportContext => ({ existingBuildingCodes: new Set(), existingRoomKeys: new Set(), campusCenter: null, existingPositions: [] } as unknown as ImportContext);
const fichier = readFileSync('docs/modeles/modele_donnees_institutionnelles.csv', 'utf8');

describe('modèle CSV institutionnel (passe 4)', () => {
  it('l’en-tête du fichier documenté est exactement celui attendu par l’import', () => {
    expect(parseCsv(fichier)[0]).toEqual([...CSV_COLUMNS]);
  });
  it('le fichier modèle ne peut JAMAIS être importé tel quel (exemples fictifs)', () => {
    const r = validateImport(parseCsv(fichier), ctx(), fichier.length);
    expect(r.canImport).toBe(false);
    expect(r.errors).toBeGreaterThanOrEqual(2);
    expect(r.issues.filter((i) => i.severity === 'error').every((i) => i.line >= 2)).toBe(true);
  });
  it('le modèle généré par l’application est lui aussi non importable et marque ses exemples', () => {
    const r = validateImport(parseCsv(csvTemplate()), ctx(), 500);
    expect(r.canImport).toBe(false);
  });
  it('les lignes d’exemple du fichier sont identifiables comme fictives', () => {
    const rows = parseCsv(fichier).slice(1);
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row.join(';')).toMatch(/EXEMPLE FICTIF/);
  });
});
