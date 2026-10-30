import { describe, expect, it } from 'vitest';
import { csvTemplate, parseCsv, validateImport, type ImportContext } from '../csv-import';

const ctx = (o: Partial<ImportContext> = {}): ImportContext => ({
  campusCenter: [15.3, -4.32], existingBuildingCodes: new Set(), existingRoomKeys: new Set(), ...o,
});
const H = 'type;code;name;description;category;building_code;floor_level;floor_name;kind;capacity;lng;lat;location_accuracy;is_accessible';
const run = (lines: string[], c = ctx()) => validateImport(parseCsv([H, ...lines].join('\n')), c);

describe('lecture CSV', () => {
  it('guillemets, séparateur ;, BOM, CRLF et virgule dans un champ', () => {
    const rows = parseCsv('\uFEFFa;b;c\r\n"x;y";"dit ""oui""";z\r\n');
    expect(rows).toEqual([['a', 'b', 'c'], ['x;y', 'dit "oui"', 'z']]);
  });
  it('séparateur virgule détecté', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('fichier vide ou lignes vides ignorées', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a;b\n\n;\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('le modèle téléchargeable contient les colonnes mais AUCUNE coordonnée inventée', () => {
    const t = csvTemplate();
    expect(t).toContain('LONGITUDE_RELEVEE');
    expect(validateImport(parseCsv(t), ctx()).canImport).toBe(false);
  });
});

describe('validation de l’import', () => {
  it('fichier valide : bâtiment + salle, écriture autorisée', () => {
    const p = run(['building;B1;Bloc A;;academic;;;;;;15,301;-4,321;5;oui', 'room;101;Salle 101;;;B1;1;;room;40;15.3011;-4.3211;;oui']);
    expect(p.errors).toBe(0);
    expect(p.buildings).toHaveLength(1);
    expect(p.rooms).toHaveLength(1);
    expect(p.buildings[0].lng).toBeCloseTo(15.301);
    expect(p.canImport).toBe(true);
  });
  it('colonnes obligatoires absentes : erreur globale, rien à importer', () => {
    const p = validateImport(parseCsv('name;code\nX;Y'), ctx());
    expect(p.canImport).toBe(false);
    expect(p.issues[0].message).toMatch(/type|lng|lat/);
  });
  it('coordonnées manquantes : erreur (jamais déduites)', () => {
    const p = run(['building;B1;Bloc A;;;;;;;;;;;']);
    expect(p.errors).toBe(1);
    expect(p.canImport).toBe(false);
  });
  it.each([['(0,0)', '0;0'], ['latitude hors plage', '15.3;95'], ['texte', 'abc;def']])('coordonnées invalides refusées : %s', (_n, c) => {
    const [lng, lat] = c.split(';');
    const p = run([`building;B1;Bloc A;;;;;;;;${lng};${lat};;`]);
    expect(p.errors).toBe(1);
    expect(p.buildings).toHaveLength(0);
  });
  it('doublon dans le fichier : erreur bloquante', () => {
    const p = run(['building;B1;A;;;;;;;;15.301;-4.321;;', 'building;b1;A bis;;;;;;;;15.302;-4.322;;']);
    expect(p.errors).toBe(1);
    expect(p.canImport).toBe(false);
  });
  it('doublon avec la base : ligne ignorée et signalée (pas d’écriture de cette ligne)', () => {
    const p = run(['building;B1;A;;;;;;;;15.301;-4.321;;', 'building;B2;B;;;;;;;;15.302;-4.322;;'], ctx({ existingBuildingCodes: new Set(['b1']) }));
    expect(p.skipped).toBe(1);
    expect(p.buildings.map((b) => b.code)).toEqual(['B2']);
    expect(p.canImport).toBe(true);
  });
  it('salle en doublon (même bâtiment + code) ignorée', () => {
    const p = run(['room;101;S;;;B1;1;;room;;15.3;-4.321;;'], ctx({ existingBuildingCodes: new Set(['b1']), existingRoomKeys: new Set(['b1|101']) }));
    expect(p.skipped).toBe(1);
    expect(p.rooms).toHaveLength(0);
  });
  it('salle vers un bâtiment introuvable : erreur', () => {
    const p = run(['room;101;S;;;INCONNU;1;;room;;15.3;-4.321;;']);
    expect(p.errors).toBe(1);
    expect(p.canImport).toBe(false);
  });
  it('salle vers un bâtiment existant en base : acceptée', () => {
    const p = run(['room;101;S;;;B1;;;room;;15.3;-4.321;;'], ctx({ existingBuildingCodes: new Set(['b1']) }));
    expect(p.rooms).toHaveLength(1);
  });
  it('type, catégorie, kind, étage, capacité, accessibilité invalides : erreurs', () => {
    expect(run(['batiment;B1;A;;;;;;;;15.3;-4.3;;']).errors).toBe(1);
    expect(run(['building;B1;A;;inconnue;;;;;;15.3;-4.3;;']).errors).toBe(1);
    expect(run(['building;B1;A;;;;;;;;15.3;-4.3;;', 'room;1;S;;;B1;;;cuisine;;15.3;-4.3;;']).errors).toBe(1);
    expect(run(['building;B1;A;;;;;;;;15.3;-4.3;;', 'room;1;S;;;B1;1,5;;room;;15.3;-4.3;;']).errors).toBe(1);
    expect(run(['building;B1;A;;;;;;;;15.3;-4.3;;', 'room;1;S;;;B1;;;room;-3;15.3;-4.3;;']).errors).toBe(1);
    expect(run(['building;B1;A;;;;;;;;15.3;-4.3;;', 'room;1;S;;;B1;;;room;;15.3;-4.3;;peutetre']).errors).toBe(1);
  });
  it('avertissements : position au centre du campus, très éloignée (longitude/latitude inversées)', () => {
    const centre = run(['building;B1;A;;;;;;;;15.3;-4.32;;']);
    expect(centre.warnings).toBeGreaterThanOrEqual(1);
    expect(centre.canImport).toBe(true); // avertissement ≠ blocage
    const inverse = run(['building;B1;A;;;;;;;;-4.32;15.3;;']);
    expect(inverse.warnings).toBeGreaterThanOrEqual(1);
  });
  it('fichier trop volumineux : refusé', () => {
    const p = validateImport(parseCsv([H, 'building;B1;A;;;;;;;;15.3;-4.3;;'].join('\n')), ctx(), 2_000_000);
    expect(p.canImport).toBe(false);
  });
  it('une importation invalide ne produit AUCUNE ligne à écrire dès qu’une erreur existe', () => {
    const p = run(['building;B1;A;;;;;;;;15.301;-4.321;;', 'building;B2;;;;;;;;;15.302;-4.322;;']);
    expect(p.canImport).toBe(false);
  });
});

describe('formats numériques acceptés (passe 4)', () => {
  const ligne = (lng: string, lat: string, cap = '') => `building;B9;Bâtiment test;;;;;;;${cap};${lng};${lat};;`;
  it('accepte les décimaux point ou virgule, signés', () => {
    expect(run([ligne('15.3012', '-4.3198')]).canImport).toBe(true);
    expect(run([ligne('15,3012', '-4,3198')]).canImport).toBe(true);
    expect(run([ligne('+15.3012', '-4.3198')]).canImport).toBe(true);
  });
  it.each([['0x10', '-4.31'], ['15.3', '0x4'], ['1e1', '-4.31'], ['15.3', '-4e0'], ['0b11', '-4.31'], ['15.3.1', '-4.31'], ['15.3', '--4'], ['Infinity', '-4.31'], ['15,3,1', '-4.31']])(
    'refuse « %s ; %s » au lieu de l’interpréter silencieusement',
    (lng, lat) => {
      const r = run([ligne(lng, lat)]);
      expect(r.canImport).toBe(false);
      expect(r.errors).toBeGreaterThan(0);
      expect(r.issues.some((i) => i.severity === 'error' && i.line === 2)).toBe(true); // l'erreur désigne la ligne fautive
    },
  );
  it('une capacité en notation hexadécimale est refusée', () => {
    expect(run([`room;S1;Salle;;;B9;;;;0x10;15.3012;-4.3198;;`, ligne('15.3012', '-4.3198')]).canImport).toBe(false);
  });
});
