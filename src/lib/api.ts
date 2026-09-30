import { supabase } from '@/lib/supabase';
import { assertValidCoordinates } from '@/lib/geo-validation';
import { readPrivacyPrefs } from '@/lib/privacy-prefs';
import { prepareImageForUpload, ImageValidationError } from '@/lib/image-compress';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  Announcement,
  Building,
  BuildingImage,
  Campus,
  CampusEvent,
  CampusLocation,
  Floor,
  LocationImage,
  RouteNode,
  RouteSegment,
} from '@/lib/types';

const BUILDING_IMAGES_BUCKET = 'building-images';
const LOCATION_IMAGES_BUCKET = 'location-images';

// ---------------------------------------------------------------------
// Normalisation des erreurs Supabase (point 7 du brief)
// ---------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Transforme une PostgrestError brute en ApiError exploitable par l'UI.
 * Ne masque JAMAIS une erreur réelle derrière un message générique : si le
 * code ne correspond à aucun cas connu, le message d'origine est conservé.
 */
function normalizeError(error: PostgrestError, context: string): ApiError {
  if (error.code === '42501' || error.message.toLowerCase().includes('permission denied')) {
    return new ApiError(
      `Permission refusée (RLS) lors de : ${context}. Vérifiez les policies Supabase.`,
      'RLS_DENIED',
      error,
    );
  }
  if (error.code === '42P01') {
    return new ApiError(`Table manquante lors de : ${context}. Migration non appliquée ?`, 'MISSING_TABLE', error);
  }
  if (error.code === '42703') {
    return new ApiError(`Colonne manquante lors de : ${context}. Migration non appliquée ?`, 'MISSING_COLUMN', error);
  }
  if (error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('fetch')) {
    return new ApiError(`Réseau indisponible lors de : ${context}.`, 'NETWORK_ERROR', error);
  }
  return new ApiError(`${context} : ${error.message}`, error.code || 'UNKNOWN', error);
}

function isMissingArchivedColumn(error: PostgrestError): boolean {
  return error.code === '42703' && error.message.includes('archived_at');
}

// ---------------------------------------------------------------------
// Validation de coordonnées (points 1, 2, 3, 5, 6)
// ---------------------------------------------------------------------

/** Rejette explicitement [0,0], qui n'est jamais une position HEC réelle
 * mais souvent le signe d'une valeur par défaut non renseignée. */
function assertNotNullIsland(lat: number, lng: number, context: string): void {
  if (lat === 0 && lng === 0) {
    throw new ApiError(
      `Coordonnées [0,0] refusées pour : ${context}. Une position réelle est requise.`,
      'NULL_ISLAND_COORDS',
    );
  }
}

function assertValidGeo(lat: number, lng: number, context: string): void {
  assertValidCoordinates(lat, lng);
  assertNotNullIsland(lat, lng, context);
}

// ---------------------------------------------------------------------
// Campus
// ---------------------------------------------------------------------

/** Récupère le campus actif. Ne retourne jamais un campus fictif : si
 * aucune ligne n'existe en base, lève une ApiError explicite plutôt que
 * de renvoyer null silencieusement (point 1 du brief). */
export async function getCampus(): Promise<Campus> {
  const { data, error } = await supabase
    .from('campuses')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw normalizeError(error, 'récupération du campus');
  if (!data) {
    throw new ApiError('Aucun campus configuré dans Supabase.', 'NO_CAMPUS');
  }
  assertValidGeo(data.center_lat, data.center_lng, 'campus');
  return data;
}

// ---------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------

/**
 * `includeArchived` : par défaut `false`, comme partout ailleurs dans
 * l'app (public, recherche, navigation) — un bâtiment archivé doit
 * rester invisible sans qu'aucun appelant n'ait à y penser. Seul l'écran
 * d'administration passe `true` pour afficher/restaurer les archives.
 */
export async function getBuildings(
  campusId: string,
  includeArchived = false,
): Promise<Building[]> {
  let query = supabase.from('buildings').select('*').eq('campus_id', campusId);
  if (!includeArchived) query = query.is('archived_at', null);
  let { data, error } = await query.order('code', { ascending: true });
  if (error && isMissingArchivedColumn(error)) {
    // La migration d'archivage n'a pas encore été appliquée sur ce projet
    // Supabase : on se replie sur la requête sans la colonne plutôt que de
    // casser tout l'admin (ajout/affichage de bâtiments) en attendant.
    ({ data, error } = await supabase
      .from('buildings')
      .select('*')
      .eq('campus_id', campusId)
      .order('code', { ascending: true }));
  }
  if (error) throw normalizeError(error, 'récupération des bâtiments');
  const raw = (data ?? []) as Building[];
  // Une salle avec des coordonnées invalides ne doit jamais apparaître sur
  // la carte, mais on ne la fait pas disparaître silencieusement : on log
  // pour que l'admin puisse la corriger (point 2/3 du brief).
  const buildings = raw.filter((b) => {
    try {
      assertValidCoordinates(b.center_lat, b.center_lng);
      return true;
    } catch {
      console.warn(`[api] Bâtiment ${b.id} (${b.code ?? '?'}) ignoré : coordonnées invalides.`);
      return false;
    }
  });
  return attachPrimaryImages(buildings);
}

/** Archive un bâtiment (masqué du public et de la navigation, mais
 * conservé et restaurable) — remplace la suppression définitive dans
 * l'usage courant de l'admin (ÉTAPE "Archivage"). */
export async function archiveBuilding(id: string): Promise<void> {
  const { error } = await supabase
    .from('buildings')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw normalizeError(error, `archivage du bâtiment ${id}`);
}

export async function restoreBuilding(id: string): Promise<void> {
  const { error } = await supabase
    .from('buildings')
    .update({ archived_at: null })
    .eq('id', id);
  if (error) throw normalizeError(error, `restauration du bâtiment ${id}`);
}

/**
 * Enrichit une liste de bâtiments avec leur photo principale et le
 * nombre total de photos (PROBLÈME 1). Ne fait jamais échouer l'appelant
 * si `building_images` n'existe pas encore ou si Storage est
 * inaccessible : les bâtiments restent affichables (repli sur l'icône
 * colorée existante) — ceci est volontaire (ressource secondaire, point 8)
 * et distinct des erreurs primaires qui, elles, ne sont jamais avalées.
 */
async function attachPrimaryImages(buildings: Building[]): Promise<Building[]> {
  if (buildings.length === 0) return buildings;
  try {
    const ids = buildings.map((b) => b.id);
    const { data, error } = await supabase
      .from('building_images')
      .select('building_id, public_url, is_primary')
      .in('building_id', ids);
    if (error) throw error;
    const images = (data ?? []) as { building_id: string; public_url: string; is_primary: boolean }[];
    const counts = new Map<string, number>();
    const primaries = new Map<string, string>();
    for (const img of images) {
      counts.set(img.building_id, (counts.get(img.building_id) ?? 0) + 1);
      if (img.is_primary && !primaries.has(img.building_id)) {
        primaries.set(img.building_id, img.public_url);
      }
    }
    return buildings.map((b) => ({
      ...b,
      primary_image_url: primaries.get(b.id) ?? null,
      image_count: counts.get(b.id) ?? 0,
    }));
  } catch (err) {
    console.warn('[api] Chargement des photos de bâtiments impossible (non bloquant) :', err);
    return buildings.map((b) => ({ ...b, primary_image_url: null, image_count: 0 }));
  }
}

export type BuildingInput = Omit<Building, 'id'>;

export async function createBuilding(input: BuildingInput): Promise<Building> {
  assertValidGeo(input.center_lat, input.center_lng, 'création de bâtiment');
  const { data, error } = await supabase
    .from('buildings')
    .insert(input)
    .select('*')
    .single();
  if (error) throw normalizeError(error, 'création du bâtiment');
  return data as Building;
}

export async function updateBuilding(
  id: string,
  input: Partial<BuildingInput>,
): Promise<Building> {
  if (input.center_lat !== undefined && input.center_lng !== undefined) {
    assertValidGeo(input.center_lat, input.center_lng, `mise à jour du bâtiment ${id}`);
  }
  const { data, error } = await supabase
    .from('buildings')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw normalizeError(error, `mise à jour du bâtiment ${id}`);
  return data as Building;
}

export async function deleteBuilding(id: string): Promise<void> {
  const { error } = await supabase.from('buildings').delete().eq('id', id);
  if (error) throw normalizeError(error, `suppression du bâtiment ${id}`);
}

// ---------------------------------------------------------------------
// Floors
// ---------------------------------------------------------------------

export async function getFloors(buildingId: string): Promise<Floor[]> {
  const { data, error } = await supabase
    .from('floors')
    .select('*')
    .eq('building_id', buildingId)
    .order('sort_order', { ascending: true });
  if (error) throw normalizeError(error, `récupération des étages du bâtiment ${buildingId}`);
  return data ?? [];
}

export type FloorInput = Omit<Floor, 'id'>;

export async function createFloor(input: FloorInput): Promise<Floor> {
  const { data, error } = await supabase
    .from('floors')
    .insert(input)
    .select('*')
    .single();
  if (error) throw normalizeError(error, 'création d\'étage');
  return data as Floor;
}

export async function deleteFloor(id: string): Promise<void> {
  const { error } = await supabase.from('floors').delete().eq('id', id);
  if (error) throw normalizeError(error, `suppression de l'étage ${id}`);
}

// ---------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------

export async function getLocations(includeArchived = false): Promise<CampusLocation[]> {
  let query = supabase
    .from('locations')
    .select('*, building:buildings(*), floor:floors(*)');
  if (!includeArchived) query = query.is('archived_at', null);
  let { data, error } = await query.order('name', { ascending: true });
  if (error && isMissingArchivedColumn(error)) {
    ({ data, error } = await supabase
      .from('locations')
      .select('*, building:buildings(*), floor:floors(*)')
      .order('name', { ascending: true }));
  }
  if (error) throw normalizeError(error, 'récupération des lieux');
  const raw = (data ?? []) as unknown as CampusLocation[];
  const locations = raw.filter((l) => {
    try {
      assertValidCoordinates(l.lat, l.lng);
      return true;
    } catch {
      console.warn(`[api] Lieu ${l.id} (${l.name ?? '?'}) ignoré : coordonnées invalides.`);
      return false;
    }
  });
  return attachPrimaryImagesToLocations(locations);
}

/** Archive une salle/un lieu (masqué du public et de la navigation, mais
 * conservé et restaurable) — remplace la suppression définitive dans
 * l'usage courant de l'admin (ÉTAPE "Archivage"). */
export async function archiveLocation(id: string): Promise<void> {
  const { error } = await supabase
    .from('locations')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw normalizeError(error, `archivage du lieu ${id}`);
}

export async function restoreLocation(id: string): Promise<void> {
  const { error } = await supabase
    .from('locations')
    .update({ archived_at: null })
    .eq('id', id);
  if (error) throw normalizeError(error, `restauration du lieu ${id}`);
}

/**
 * Enrichit chaque lieu avec sa PROPRE photo principale (`location_images`)
 * quand elle existe, et avec celle de son bâtiment (`location.building`)
 * dans tous les cas — pour que l'UI puisse toujours se replier sur la
 * photo du bâtiment si la salle elle-même n'a pas encore de photo (une
 * salle a sa propre galerie, distincte de celle du bâtiment — voir
 * PROBLÈME 2 du cahier des charges / migration `location_images`).
 * Non bloquant (ressource secondaire) : en cas d'échec, les lieux restent
 * affichables sans photo.
 */
async function attachPrimaryImagesToLocations(
  locations: CampusLocation[],
): Promise<CampusLocation[]> {
  if (locations.length === 0) return locations;

  const buildings = locations
    .map((l) => l.building)
    .filter((b): b is Building => !!b);
  const uniqueBuildingsById = new Map(buildings.map((b) => [b.id, b]));
  const enrichedBuildings =
    uniqueBuildingsById.size > 0
      ? await attachPrimaryImages([...uniqueBuildingsById.values()])
      : [];
  const enrichedBuildingsById = new Map(enrichedBuildings.map((b) => [b.id, b]));

  let ownPrimaries = new Map<string, string>();
  let ownCounts = new Map<string, number>();
  try {
    const ids = locations.map((l) => l.id);
    const { data, error } = await supabase
      .from('location_images')
      .select('location_id, public_url, is_primary')
      .in('location_id', ids);
    if (error) throw error;
    const images = (data ?? []) as {
      location_id: string;
      public_url: string;
      is_primary: boolean;
    }[];
    for (const img of images) {
      ownCounts.set(img.location_id, (ownCounts.get(img.location_id) ?? 0) + 1);
      if (img.is_primary && !ownPrimaries.has(img.location_id)) {
        ownPrimaries.set(img.location_id, img.public_url);
      }
    }
  } catch (err) {
    // Table absente (migration pas encore poussée) ou erreur réseau : ne
    // bloque jamais l'affichage des lieux, uniquement leurs photos propres.
    console.warn('[api] Chargement des photos de lieux impossible (non bloquant) :', err);
    ownPrimaries = new Map();
    ownCounts = new Map();
  }

  return locations.map((loc) => {
    const building = loc.building ? enrichedBuildingsById.get(loc.building.id) ?? loc.building : loc.building;
    return {
      ...loc,
      building,
      primary_image_url: ownPrimaries.get(loc.id) ?? null,
      image_count: ownCounts.get(loc.id) ?? 0,
    };
  });
}

export type LocationInput = Omit<
  CampusLocation,
  'id' | 'building' | 'floor'
>;

export async function createLocation(
  input: LocationInput,
): Promise<CampusLocation> {
  assertValidGeo(input.lat, input.lng, 'création de lieu');
  const { data, error } = await supabase
    .from('locations')
    .insert(input)
    .select('*, building:buildings(*), floor:floors(*)')
    .single();
  if (error) throw normalizeError(error, 'création du lieu');
  return data as unknown as CampusLocation;
}

export async function updateLocation(
  id: string,
  input: Partial<LocationInput>,
): Promise<CampusLocation> {
  if (input.lat !== undefined && input.lng !== undefined) {
    assertValidGeo(input.lat, input.lng, `mise à jour du lieu ${id}`);
  }
  const { data, error } = await supabase
    .from('locations')
    .update(input)
    .eq('id', id)
    .select('*, building:buildings(*), floor:floors(*)')
    .single();
  if (error) throw normalizeError(error, `mise à jour du lieu ${id}`);
  return data as unknown as CampusLocation;
}

export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase.from('locations').delete().eq('id', id);
  if (error) throw normalizeError(error, `suppression du lieu ${id}`);
}

// ---------------------------------------------------------------------
// Events / Announcements / Favorites / Search history
// Ressources secondaires du point de vue du campus : une panne ici ne
// doit jamais empêcher l'affichage de la carte, mais l'erreur reste
// propagée à l'appelant (qui décide, lui, s'il l'ignore) plutôt que
// d'être avalée ici (point 8 du brief).
// ---------------------------------------------------------------------

export async function getEvents(campusId: string): Promise<CampusEvent[]> {
  const { data, error } = await supabase
    .from('campus_events')
    .select('*')
    .eq('campus_id', campusId)
    .order('starts_at', { ascending: true })
    .limit(200);
  if (error) throw normalizeError(error, 'récupération des événements');
  return data ?? [];
}

export async function getAnnouncements(
  campusId: string,
): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('campus_id', campusId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw normalizeError(error, 'récupération des annonces');
  return (data ?? []) as Announcement[];
}

export async function getFavorites(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select('location_id')
    .eq('user_id', userId);
  if (error) throw normalizeError(error, 'récupération des favoris');
  return (data ?? []).map((row) => row.location_id as string);
}

export async function addFavorite(locationId: string): Promise<void> {
  const { error } = await supabase
    .from('favorites')
    .insert({ location_id: locationId });
  if (error && error.code !== '23505') throw normalizeError(error, "ajout d'un favori");
}

export async function removeFavorite(locationId: string): Promise<void> {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('location_id', locationId);
  if (error) throw normalizeError(error, "suppression d'un favori");
}

export async function logSearch(query: string): Promise<void> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  // Préférence de confidentialité (Paramètres → Confidentialité et
  // données) : l'utilisateur peut refuser l'enregistrement de ses
  // recherches. La recherche elle-même n'est pas affectée.
  if (!readPrivacyPrefs().saveSearchHistory) return;
  const { error } = await supabase.from('search_history').insert({ query: trimmed });
  // Historique de recherche = pure télémétrie, non critique : on logue
  // sans faire échouer la recherche elle-même.
  if (error) console.warn('[api] Journalisation de recherche impossible (non bloquant) :', error);
}

export async function getRecentSearches(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('search_history')
    .select('query')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(6);
  if (error) throw normalizeError(error, 'récupération des recherches récentes');
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of data ?? []) {
    const q = row.query as string;
    if (!seen.has(q.toLowerCase())) {
      seen.add(q.toLowerCase());
      result.push(q);
    }
  }
  return result;
}

// ---------------------------------------------------------------------
// Réseau de navigation (route_nodes / route_segments)
// ---------------------------------------------------------------------
export async function getRouteNodes(
  campusId: string,
  includeArchived = false,
): Promise<RouteNode[]> {
  let query = supabase.from('route_nodes').select('*').eq('campus_id', campusId);
  if (!includeArchived) query = query.is('archived_at', null);
  let { data, error } = await query;
  if (error && isMissingArchivedColumn(error)) {
    ({ data, error } = await supabase.from('route_nodes').select('*').eq('campus_id', campusId));
  }
  if (error) {
    // Table absente sur ce déploiement : dégrade vers l'itinéraire direct
    // plutôt que de casser "Me guider" (voir nav.ts). Toute AUTRE erreur
    // (RLS, réseau...) reste propagée, pour ne pas masquer un vrai problème.
    if (error.code === '42P01') return [];
    throw normalizeError(error, 'récupération des nœuds de navigation');
  }
  const raw = (data ?? []) as RouteNode[];
  return raw.filter((n) => {
    try {
      assertValidCoordinates(n.lat, n.lng);
      return true;
    } catch {
      console.warn(`[api] Nœud de navigation ${n.id} ignoré : coordonnées invalides.`);
      return false;
    }
  });
}

export async function getRouteSegments(
  campusId: string,
  includeArchived = false,
): Promise<RouteSegment[]> {
  let query = supabase.from('route_segments').select('*').eq('campus_id', campusId);
  if (!includeArchived) query = query.is('archived_at', null);
  let { data, error } = await query;
  if (error && isMissingArchivedColumn(error)) {
    ({ data, error } = await supabase
      .from('route_segments')
      .select('*')
      .eq('campus_id', campusId));
  }
  if (error) {
    if (error.code === '42P01') return [];
    throw normalizeError(error, 'récupération des segments de navigation');
  }
  return data ?? [];
}

/**
 * Filtre les segments dont l'un des deux nœuds référencés n'existe plus
 * (from_node/to_node orphelin) — sans cela, Dijkstra (nav.ts) peut planter
 * ou produire un chemin invalide. Signale les incohérences trouvées.
 */
export function filterValidSegments(
  nodes: RouteNode[],
  segments: RouteSegment[],
): RouteSegment[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  return segments.filter((s) => {
    const valid = nodeIds.has(s.from_node) && nodeIds.has(s.to_node);
    if (!valid) {
      console.warn(`[api] Segment ${s.id} ignoré : référence un nœud inexistant.`);
    }
    return valid;
  });
}

export type RouteNodeInput = Omit<RouteNode, 'id'>;

export async function createRouteNode(input: RouteNodeInput): Promise<RouteNode> {
  assertValidGeo(input.lat, input.lng, 'création de nœud de navigation');
  const { data, error } = await supabase
    .from('route_nodes')
    .insert(input)
    .select('*')
    .single();
  if (error) throw normalizeError(error, 'création du nœud de navigation');
  return data as RouteNode;
}

export async function updateRouteNode(
  id: string,
  input: Partial<RouteNodeInput>,
): Promise<RouteNode> {
  if (input.lat !== undefined && input.lng !== undefined) {
    assertValidGeo(input.lat, input.lng, `mise à jour du nœud ${id}`);
  }
  const { data, error } = await supabase
    .from('route_nodes')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw normalizeError(error, `mise à jour du nœud ${id}`);
  return data as RouteNode;
}

export async function deleteRouteNode(id: string): Promise<void> {
  const { error } = await supabase.from('route_nodes').delete().eq('id', id);
  if (error) throw normalizeError(error, `suppression du nœud ${id}`);
}

export type RouteSegmentInput = Omit<RouteSegment, 'id'>;

export async function createRouteSegment(
  input: RouteSegmentInput,
): Promise<RouteSegment> {
  if (input.from_node === input.to_node) {
    throw new ApiError('Un segment ne peut pas relier un nœud à lui-même.', 'INVALID_SEGMENT');
  }
  const { data, error } = await supabase
    .from('route_segments')
    .insert(input)
    .select('*')
    .single();
  if (error) throw normalizeError(error, 'création du segment de navigation');
  return data as RouteSegment;
}

export async function updateRouteSegment(
  id: string,
  input: Partial<RouteSegmentInput>,
): Promise<RouteSegment> {
  if (
    input.from_node !== undefined &&
    input.to_node !== undefined &&
    input.from_node === input.to_node
  ) {
    throw new ApiError('Un segment ne peut pas relier un nœud à lui-même.', 'INVALID_SEGMENT');
  }
  const { data, error } = await supabase
    .from('route_segments')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw normalizeError(error, `mise à jour du segment ${id}`);
  return data as RouteSegment;
}

export async function deleteRouteSegment(id: string): Promise<void> {
  const { error } = await supabase.from('route_segments').delete().eq('id', id);
  if (error) throw normalizeError(error, `suppression du segment ${id}`);
}

/** Supprime un nœud ainsi que tous les segments qui s'y rattachent — sans
 * cela, un nœud supprimé laisserait des segments orphelins pointant vers un
 * `from_node`/`to_node` inexistant, ce que Dijkstra (nav.ts) ne gère pas.
 * Les segments sont supprimés séquentiellement (et non via Promise.all) afin
 * qu'une erreur sur l'un d'eux soit rapportée précisément avant de toucher
 * au nœud lui-même. */
export async function deleteRouteNodeCascade(
  nodeId: string,
  allSegments: RouteSegment[],
): Promise<void> {
  const attached = allSegments.filter(
    (s) => s.from_node === nodeId || s.to_node === nodeId,
  );
  for (const seg of attached) {
    await deleteRouteSegment(seg.id);
  }
  await deleteRouteNode(nodeId);
}

// ---------------------------------------------------------------------
// Photos des bâtiments (building_images + Supabase Storage) — PROBLÈME 1.
// Les fichiers vont dans Storage, jamais dans PostgreSQL : seule l'URL
// publique et le chemin de stockage sont enregistrés en base.
// ---------------------------------------------------------------------

export async function getBuildingImages(buildingId: string): Promise<BuildingImage[]> {
  const { data, error } = await supabase
    .from('building_images')
    .select('*')
    .eq('building_id', buildingId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw normalizeError(error, `récupération des photos du bâtiment ${buildingId}`);
  return (data ?? []) as BuildingImage[];
}

/**
 * Valide + compresse une image avant envoi (redimensionnement 1920 px,
 * WebP, limite finale 5 Mo — alignée sur le bucket Storage, cf. migration
 * 20260930090000). Traduit l'erreur de validation en ApiError.
 */
async function prepareUpload(file: File): Promise<File> {
  try {
    return await prepareImageForUpload(file);
  } catch (err) {
    if (err instanceof ImageValidationError) throw new ApiError(err.message, err.code, err);
    throw err;
  }
}

/**
 * Envoie un fichier image vers Supabase Storage puis crée la ligne
 * `building_images` correspondante. Si c'est la toute première photo du
 * bâtiment, elle devient automatiquement la photo principale.
 */
export async function uploadBuildingImage(
  buildingId: string,
  file: File,
  options: { caption?: string; isPrimary?: boolean } = {},
): Promise<BuildingImage> {
  file = await prepareUpload(file);

  const existing = await getBuildingImages(buildingId);
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `${buildingId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BUILDING_IMAGES_BUCKET)
    .upload(storagePath, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (uploadError) {
    throw new ApiError(`Échec de l'envoi de l'image : ${uploadError.message}`, 'STORAGE_UPLOAD_FAILED', uploadError);
  }

  const { data: publicUrlData } = supabase.storage
    .from(BUILDING_IMAGES_BUCKET)
    .getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from('building_images')
    .insert({
      building_id: buildingId,
      storage_path: storagePath,
      public_url: publicUrlData.publicUrl,
      caption: options.caption ?? '',
      is_primary: options.isPrimary ?? existing.length === 0,
      sort_order: existing.length,
    })
    .select('*')
    .single();

  if (error) {
    // Ne laisse pas un fichier orphelin dans Storage si l'insertion échoue.
    await supabase.storage.from(BUILDING_IMAGES_BUCKET).remove([storagePath]);
    throw normalizeError(error, "enregistrement de la photo de bâtiment");
  }
  return data as BuildingImage;
}

export async function setPrimaryBuildingImage(image: BuildingImage): Promise<void> {
  const { error } = await supabase
    .from('building_images')
    .update({ is_primary: true })
    .eq('id', image.id);
  if (error) throw normalizeError(error, 'changement de photo principale (bâtiment)');
  // Le trigger `enforce_single_primary_building_image` rétrograde les
  // autres photos du même bâtiment côté base — rien d'autre à faire ici.
}

export async function updateBuildingImageCaption(id: string, caption: string): Promise<void> {
  const { error } = await supabase.from('building_images').update({ caption }).eq('id', id);
  if (error) throw normalizeError(error, "mise à jour de la légende (bâtiment)");
}

export async function reorderBuildingImages(images: BuildingImage[]): Promise<void> {
  // Séquentiel plutôt que Promise.all : si une ligne échoue (RLS, réseau),
  // l'erreur pointe clairement vers l'image concernée au lieu d'un échec
  // groupé silencieux, et l'ordre déjà écrit reste cohérent.
  for (const [index, img] of images.entries()) {
    const { error } = await supabase.from('building_images').update({ sort_order: index }).eq('id', img.id);
    if (error) throw normalizeError(error, `réordonnancement de la photo ${img.id}`);
  }
}

export async function deleteBuildingImage(image: BuildingImage): Promise<void> {
  const { error } = await supabase.from('building_images').delete().eq('id', image.id);
  if (error) throw normalizeError(error, 'suppression de la photo de bâtiment');
  // Supprime aussi le fichier réel dans Storage — pas seulement la ligne
  // en base — pour ne pas laisser de fichiers orphelins facturés.
  await supabase.storage.from(BUILDING_IMAGES_BUCKET).remove([image.storage_path]);
  // Si l'image supprimée était la principale, promeut la plus ancienne
  // image restante pour qu'un bâtiment avec des photos n'en affiche
  // jamais aucune par accident.
  if (image.is_primary) {
    const remaining = await getBuildingImages(image.building_id);
    if (remaining.length > 0) {
      await setPrimaryBuildingImage(remaining[0]);
    }
  }
}

// ---------------------------------------------------------------------
// Photos des salles/lieux (location_images + Supabase Storage) —
// PROBLÈME 2 du cahier des charges : une salle a sa propre galerie,
// distincte de celle du bâtiment qui la contient. Miroir exact du
// pattern `building_images` ci-dessus.
// ---------------------------------------------------------------------

export async function getLocationImages(locationId: string): Promise<LocationImage[]> {
  const { data, error } = await supabase
    .from('location_images')
    .select('*')
    .eq('location_id', locationId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw normalizeError(error, `récupération des photos du lieu ${locationId}`);
  return (data ?? []) as LocationImage[];
}

/**
 * Envoie un fichier image vers Supabase Storage puis crée la ligne
 * `location_images` correspondante. Si c'est la toute première photo du
 * lieu, elle devient automatiquement la photo principale.
 */
export async function uploadLocationImage(
  locationId: string,
  file: File,
  options: { caption?: string; isPrimary?: boolean } = {},
): Promise<LocationImage> {
  file = await prepareUpload(file);

  const existing = await getLocationImages(locationId);
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `${locationId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(LOCATION_IMAGES_BUCKET)
    .upload(storagePath, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (uploadError) {
    throw new ApiError(`Échec de l'envoi de l'image : ${uploadError.message}`, 'STORAGE_UPLOAD_FAILED', uploadError);
  }

  const { data: publicUrlData } = supabase.storage
    .from(LOCATION_IMAGES_BUCKET)
    .getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from('location_images')
    .insert({
      location_id: locationId,
      storage_path: storagePath,
      public_url: publicUrlData.publicUrl,
      caption: options.caption ?? '',
      is_primary: options.isPrimary ?? existing.length === 0,
      sort_order: existing.length,
    })
    .select('*')
    .single();

  if (error) {
    // Ne laisse pas un fichier orphelin dans Storage si l'insertion échoue.
    await supabase.storage.from(LOCATION_IMAGES_BUCKET).remove([storagePath]);
    throw normalizeError(error, 'enregistrement de la photo de lieu');
  }
  return data as LocationImage;
}

export async function setPrimaryLocationImage(image: LocationImage): Promise<void> {
  const { error } = await supabase
    .from('location_images')
    .update({ is_primary: true })
    .eq('id', image.id);
  if (error) throw normalizeError(error, 'changement de photo principale (lieu)');
  // Le trigger `enforce_single_primary_location_image` rétrograde les
  // autres photos du même lieu côté base — rien d'autre à faire ici.
}

export async function updateLocationImageCaption(id: string, caption: string): Promise<void> {
  const { error } = await supabase.from('location_images').update({ caption }).eq('id', id);
  if (error) throw normalizeError(error, 'mise à jour de la légende (lieu)');
}

export async function reorderLocationImages(images: LocationImage[]): Promise<void> {
  for (const [index, img] of images.entries()) {
    const { error } = await supabase.from('location_images').update({ sort_order: index }).eq('id', img.id);
    if (error) throw normalizeError(error, `réordonnancement de la photo ${img.id}`);
  }
}

export async function deleteLocationImage(image: LocationImage): Promise<void> {
  const { error } = await supabase.from('location_images').delete().eq('id', image.id);
  if (error) throw normalizeError(error, 'suppression de la photo de lieu');
  // Supprime aussi le fichier réel dans Storage — pas seulement la ligne
  // en base — pour ne pas laisser de fichiers orphelins facturés.
  await supabase.storage.from(LOCATION_IMAGES_BUCKET).remove([image.storage_path]);
  // Si l'image supprimée était la principale, promeut la plus ancienne
  // image restante pour qu'un lieu avec des photos n'en affiche jamais
  // aucune par accident.
  if (image.is_primary) {
    const remaining = await getLocationImages(image.location_id);
    if (remaining.length > 0) {
      await setPrimaryLocationImage(remaining[0]);
    }
  }
}