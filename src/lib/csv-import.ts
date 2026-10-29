/* ============================================================================
 * csv-import.ts — lecture, validation et prévisualisation d'un CSV de bâtiments et de salles.
 * Fonctions PURES : rien n'est écrit ici. L'écriture se fait ensuite, en une seule transaction
 * (fonction SQL import_campus_data), seulement si aucune erreur bloquante n'a été détectée.
 * Format documenté : docs/IMPORT_CSV.md.
 * ========================================================================= */
import { haversine } from '@/lib/nav';
import type { BuildingCategory, LocationKind } from '@/lib/types';

export const CSV_COLUMNS = [
  'type', 'code', 'name', 'description', 'category', 'building_code', 'floor_level', 'floor_name',
  'kind', 'capacity', 'lng', 'lat', 'location_accuracy', 'is_accessible',
] as const;
export const REQUIRED_COLUMNS = ['type', 'name', 'lng', 'lat'] as const;
export const MAX_BUILDINGS = 500;
export const MAX_ROOMS = 2000;
export const MAX_FILE_BYTES = 1_000_000;
const CATEGORIES: BuildingCategory[] = ['academic', 'library', 'admin', 'student_life'];
const KINDS: LocationKind[] = ['room', 'office', 'service', 'poi', 'entrance', 'exit', 'facility'];
export const FAR_WARNING_M = 5000;

export function csvTemplate(): string {
  return [
    CSV_COLUMNS.join(';'),
    'building;BLOC-A;Nom officiel du bâtiment;Description;academic;;;;;;LONGITUDE_RELEVEE;LATITUDE_RELEVEE;5;oui',
    'room;A-101;Nom officiel de la salle;;;BLOC-A;1;Étage 1;room;40;LONGITUDE_RELEVEE;LATITUDE_RELEVEE;5;oui',
  ].join('\n');
}

/** Lecteur CSV (guillemets, délimiteur , ou ;, BOM, CRLF). Ne lève jamais : renvoie des lignes de textes. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export interface ImportIssue {
  /** Numéro de ligne dans le fichier (1 = en-tête). 0 = problème global. */
  line: number;
  severity: 'error' | 'warning' | 'skipped';
  message: string;
}
export interface BuildingRow { code: string; name: string; description: string; category: BuildingCategory; lng: number; lat: number; location_accuracy: number | null }
export interface RoomRow { building_code: string; floor_level: number | null; floor_name: string; code: string; name: string; kind: LocationKind; description: string; capacity: number | null; lng: number; lat: number; is_accessible: boolean }
export interface ImportContext {
  campusCenter: [number, number] | null;
  /** Codes de bâtiments actifs déjà en base (comparaison insensible à la casse). */
  existingBuildingCodes: Set<string>;
  /** Clés `codeBatiment|codeSalle` actives déjà en base (minuscules). */
  existingRoomKeys: Set<string>;
}
export interface ImportPreview {
  buildings: BuildingRow[];
  rooms: RoomRow[];
  issues: ImportIssue[];
  errors: number;
  warnings: number;
  skipped: number;
  /** Vrai si l'écriture est autorisée : aucune erreur bloquante et au moins une ligne à créer. */
  canImport: boolean;
}

const lc = (s: string) => s.trim().toLowerCase();
function num(raw: string, decimalComma: boolean): number | null {
  const t = raw.trim().replace(/\s/g, '');
  if (t === '') return null;
  const n = Number(decimalComma ? t.replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
}
function bool(raw: string): boolean | null {
  const t = lc(raw);
  if (t === '') return true;
  if (['oui', 'true', '1', 'yes', 'o'].includes(t)) return true;
  if (['non', 'false', '0', 'no', 'n'].includes(t)) return false;
  return null;
}

export function validateImport(rows: string[][], ctx: ImportContext, fileBytes = 0): ImportPreview {
  const issues: ImportIssue[] = [];
  const out: ImportPreview = { buildings: [], rooms: [], issues, errors: 0, warnings: 0, skipped: 0, canImport: false };
  const add = (line: number, severity: ImportIssue['severity'], message: string) => issues.push({ line, severity, message });

  if (fileBytes > MAX_FILE_BYTES) add(0, 'error', 'Fichier trop volumineux (1 Mo maximum).');
  if (rows.length === 0) { add(0, 'error', 'Fichier vide.'); return finalize(out); }
  const header = rows[0].map(lc);
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    add(1, 'error', `Colonnes obligatoires absentes : ${missing.join(', ')}.`);
    return finalize(out);
  }
  const unknown = header.filter((h) => h && !(CSV_COLUMNS as readonly string[]).includes(h));
  if (unknown.length) add(1, 'warning', `Colonnes ignorées : ${unknown.join(', ')}.`);
  const idx = (c: string) => header.indexOf(c);
  const get = (r: string[], c: string) => (idx(c) >= 0 ? (r[idx(c)] ?? '').trim() : '');

  const fileBuildingCodes = new Map<string, number>();
  const filePositions = new Map<string, number>();
  const seenRoomKeys = new Map<string, number>();
  const pendingRooms: Array<{ line: number; room: RoomRow }> = [];

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const type = lc(get(r, 'type'));
    const name = get(r, 'name');
    const lng = num(get(r, 'lng'), true);
    const lat = num(get(r, 'lat'), true);
    if (type !== 'building' && type !== 'room') { add(line, 'error', 'Type inconnu (« building » ou « room » attendu).'); return; }
    if (!name) { add(line, 'error', 'Nom obligatoire.'); return; }
    if (lng === null || lat === null) { add(line, 'error', 'Coordonnées manquantes ou illisibles : elles ne sont jamais déduites.'); return; }
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) { add(line, 'error', 'Coordonnées hors plage (longitude −180…180, latitude −90…90).'); return; }
    if (Math.abs(lng) < 1e-6 && Math.abs(lat) < 1e-6) { add(line, 'error', 'Coordonnées (0, 0) refusées.'); return; }
    if (ctx.campusCenter) {
      const d = haversine([lng, lat], ctx.campusCenter);
      if (d < 5) add(line, 'warning', 'Position identique au centre du campus : est-elle réellement mesurée ?');
      else if (d > FAR_WARNING_M) add(line, 'warning', `Position à ${(d / 1000).toFixed(1)} km du campus : vérifiez longitude/latitude (inversées ?).`);
    }
    const posKey = `${lng.toFixed(6)},${lat.toFixed(6)}`;
    const prev = filePositions.get(posKey);
    if (prev !== undefined && type === 'building') add(line, 'warning', `Même position que la ligne ${prev}.`);
    filePositions.set(posKey, line);

    if (type === 'building') {
      const code = get(r, 'code');
      if (!code) { add(line, 'error', 'Code du bâtiment obligatoire.'); return; }
      const key = lc(code);
      if (fileBuildingCodes.has(key)) { add(line, 'error', `Doublon dans le fichier : le code « ${code} » apparaît déjà ligne ${fileBuildingCodes.get(key)}.`); return; }
      fileBuildingCodes.set(key, line);
      if (ctx.existingBuildingCodes.has(key)) { add(line, 'skipped', `Doublon : le bâtiment « ${code} » existe déjà — ligne ignorée.`); return; }
      const cat = lc(get(r, 'category')) || 'academic';
      if (!CATEGORIES.includes(cat as BuildingCategory)) { add(line, 'error', `Catégorie inconnue « ${cat} » (${CATEGORIES.join(', ')}).`); return; }
      const acc = num(get(r, 'location_accuracy'), true);
      if (get(r, 'location_accuracy') && (acc === null || acc < 0)) { add(line, 'error', 'Précision (location_accuracy) invalide : nombre de mètres ≥ 0 attendu.'); return; }
      out.buildings.push({ code, name, description: get(r, 'description'), category: cat as BuildingCategory, lng, lat, location_accuracy: acc });
    } else {
      const bcode = get(r, 'building_code');
      if (!bcode) { add(line, 'error', 'building_code obligatoire pour une salle.'); return; }
      const kind = lc(get(r, 'kind')) || 'room';
      if (!KINDS.includes(kind as LocationKind)) { add(line, 'error', `Type de lieu inconnu « ${kind} » (${KINDS.join(', ')}).`); return; }
      const lvlRaw = get(r, 'floor_level');
      const lvl = lvlRaw === '' ? null : num(lvlRaw, false);
      if (lvlRaw !== '' && (lvl === null || !Number.isInteger(lvl))) { add(line, 'error', 'floor_level doit être un entier.'); return; }
      const capRaw = get(r, 'capacity');
      const cap = capRaw === '' ? null : num(capRaw, false);
      if (capRaw !== '' && (cap === null || !Number.isInteger(cap) || cap < 0)) { add(line, 'error', 'capacity doit être un entier ≥ 0.'); return; }
      const acc = bool(get(r, 'is_accessible'));
      if (acc === null) { add(line, 'error', 'is_accessible : oui/non attendu.'); return; }
      const code = get(r, 'code');
      const key = `${lc(bcode)}|${lc(code)}`;
      if (code) {
        if (seenRoomKeys.has(key)) { add(line, 'error', `Doublon dans le fichier : la salle « ${code} » du bâtiment « ${bcode} » apparaît déjà ligne ${seenRoomKeys.get(key)}.`); return; }
        seenRoomKeys.set(key, line);
        if (ctx.existingRoomKeys.has(key)) { add(line, 'skipped', `Doublon : la salle « ${code} » existe déjà dans « ${bcode} » — ligne ignorée.`); return; }
      }
      pendingRooms.push({ line, room: { building_code: bcode, floor_level: lvl, floor_name: get(r, 'floor_name'), code, name, kind: kind as LocationKind, description: get(r, 'description'), capacity: cap, lng, lat, is_accessible: acc } });
    }
  });

  // Une salle doit référencer un bâtiment existant OU créé par ce même fichier.
  for (const { line, room } of pendingRooms) {
    const k = lc(room.building_code);
    if (fileBuildingCodes.has(k) || ctx.existingBuildingCodes.has(k)) out.rooms.push(room);
    else add(line, 'error', `Bâtiment « ${room.building_code} » introuvable (ni dans la base, ni dans le fichier).`);
  }
  // Salle d'un bâtiment dont la ligne a été ignorée comme doublon : référence valide (bâtiment existant).
  if (out.buildings.length > MAX_BUILDINGS) add(0, 'error', `Trop de bâtiments (${MAX_BUILDINGS} maximum).`);
  if (out.rooms.length > MAX_ROOMS) add(0, 'error', `Trop de salles (${MAX_ROOMS} maximum).`);
  return finalize(out);
}

function finalize(p: ImportPreview): ImportPreview {
  p.issues.sort((a, b) => a.line - b.line);
  p.errors = p.issues.filter((i) => i.severity === 'error').length;
  p.warnings = p.issues.filter((i) => i.severity === 'warning').length;
  p.skipped = p.issues.filter((i) => i.severity === 'skipped').length;
  p.canImport = p.errors === 0 && p.buildings.length + p.rooms.length > 0;
  return p;
}
