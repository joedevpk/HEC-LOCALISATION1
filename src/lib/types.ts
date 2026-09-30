// ---------------------------------------------------------------------
// Rôles & profils
// ---------------------------------------------------------------------
export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'CAMPUS_MANAGER'
  | 'STAFF'
  | 'TEACHER'
  | 'STUDENT'
  | 'VISITOR';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  created_at: string;
  avatar_url?: string;
}

// ---------------------------------------------------------------------
// Coordonnées géographiques — types explicites pour lever toute
// ambiguïté d'ordre entre lng/lat et lat/lng.
//
// Les entités métier (Campus, Building, CampusLocation, RouteNode…)
// continuent d'exposer des champs nommés explicitement (`lng`/`lat`,
// `center_lng`/`center_lat`, etc.) : on ne les remplace PAS par ces
// types pour ne pas casser les consommateurs existants (api.ts, nav.ts,
// geolocation.ts, CampusMap.tsx…). Ces alias servent aux fonctions
// utilitaires / calculs géométriques qui manipulent des paires brutes.
// ---------------------------------------------------------------------

/** Ordre [longitude, latitude] — celui attendu par MapLibre GL JS
 * (Map#setCenter, GeoJSON Position, etc.). */
export type LngLat = readonly [lng: number, lat: number];

/** Variante objet, pour les cas où la lisibilité prime (props de
 * composants, formulaires d'édition, logs). */
export interface LatLng {
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------
// Campus / Bâtiments / Étages
// ---------------------------------------------------------------------
export interface Campus {
  id: string;
  name: string;
  tagline: string;
  city: string;
  /** Longitude du centre du campus (ordre lng, lat — voir `LngLat`). */
  center_lng: number;
  /** Latitude du centre du campus. */
  center_lat: number;
  default_zoom: number;
}

export type BuildingCategory =
  | 'academic'
  | 'library'
  | 'admin'
  | 'student_life';

export interface Building {
  id: string;
  campus_id: string;
  name: string;
  code: string;
  description: string;
  category: BuildingCategory;
  color: string;
  /** Longitude du centre du bâtiment. */
  center_lng: number;
  /** Latitude du centre du bâtiment. */
  center_lat: number;
  floor_count: number;
  /** Enrichi côté client depuis `building_images` (jamais une colonne de
   * `buildings`) — URL publique de la photo marquée comme principale,
   * ou null si le bâtiment n'a pas encore de photo. */
  primary_image_url?: string | null;
  /** Enrichi côté client : nombre total de photos du bâtiment. */
  image_count?: number;
  /** `null` = actif. Une date = archivé (masqué du public, restaurable
   * par un admin) — voir migration `20260903090000_archive_campus_entities`. */
  archived_at?: string | null;
}

/** Photo d'un bâtiment (PROBLÈME 1 du cahier des charges), stockée dans
 * Supabase Storage — seuls le chemin et l'URL publique sont en base. */
export interface BuildingImage {
  id: string;
  building_id: string;
  storage_path: string;
  public_url: string;
  caption: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

export interface Floor {
  id: string;
  building_id: string;
  level: number;
  name: string;
  sort_order: number;
}

// ---------------------------------------------------------------------
// Lieux (salles, bureaux, services, POI internes, entrées/sorties…)
// ---------------------------------------------------------------------
export type LocationKind =
  | 'room'
  | 'office'
  | 'service'
  | 'poi'
  | 'entrance'
  | 'exit'
  | 'facility';

export interface CampusLocation {
  id: string;
  building_id: string | null;
  floor_id: string | null;
  name: string;
  code: string;
  kind: LocationKind;
  category: string;
  description: string;
  capacity: number | null;
  /** Longitude du lieu. */
  lng: number;
  /** Latitude du lieu. */
  lat: number;
  is_accessible: boolean;
  building?: Building | null;
  floor?: Floor | null;
  /** `null` = actif. Une date = archivé (masqué du public, restaurable
   * par un admin) — voir migration `20260903090000_archive_campus_entities`. */
  archived_at?: string | null;
  /** Enrichi côté client depuis `location_images` (jamais une colonne de
   * `locations`) — URL publique de la photo principale DU LIEU LUI-MÊME
   * (pas celle du bâtiment). `null`/`undefined` si le lieu n'a pas encore
   * sa propre photo — l'UI doit alors se replier sur `building.primary_image_url`. */
  primary_image_url?: string | null;
  /** Enrichi côté client : nombre total de photos propres à ce lieu. */
  image_count?: number;
}

/** Photo d'une salle/d'un lieu (distincte de la photo du bâtiment qui le
 * contient), stockée dans Supabase Storage — seuls le chemin et l'URL
 * publique sont en base. Voir migration `20260829000000_location_images`. */
export interface LocationImage {
  id: string;
  location_id: string;
  storage_path: string;
  public_url: string;
  caption: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

// ---------------------------------------------------------------------
// Événements / Annonces / Favoris
// ---------------------------------------------------------------------
export interface CampusEvent {
  id: string;
  campus_id: string;
  title: string;
  description: string;
  image_url: string;
  starts_at: string;
  location_label: string;
  organizer: string;
}

export interface Announcement {
  id: string;
  campus_id: string;
  title: string;
  body: string;
  category: 'ACADEMIC' | 'GENERAL' | 'URGENT' | 'EVENT' | 'MAINTENANCE';
  created_at: string;
}

export interface Favorite {
  id: string;
  user_id: string;
  location_id: string;
  created_at: string;
}

// ---------------------------------------------------------------------
// Réseau de navigation (route_nodes / route_segments) — ÉTAPE 5.
// Prépare la structure pour un routing standard + PMR (pas le moteur
// lui-même, qui reste hors-scope de ce fichier).
// ---------------------------------------------------------------------
export type RouteNodeType =
  | 'entrance'
  | 'intersection'
  | 'corridor'
  | 'stairs'
  | 'elevator'
  | 'ramp'
  | 'poi';

export interface RouteNode {
  id: string;
  campus_id: string;
  /** Longitude du nœud. */
  lng: number;
  /** Latitude du nœud. */
  lat: number;
  type: RouteNodeType;
  label: string | null;
  /** Optionnel. La franchissabilité PMR est en partie déductible de
   * `type` (`stairs` vs `ramp`/`elevator`), mais certains nœuds neutres
   * (`intersection`, `corridor`) peuvent aussi être impraticables
   * (ressaut, largeur insuffisante...). Ce champ permet de le marquer
   * explicitement sans devoir l'inférer du type. `undefined` = inconnu,
   * à ne pas confondre avec `false`. */
  accessible?: boolean;
  archived_at?: string | null;
}

export type RouteSegmentType = 'walkway' | 'corridor' | 'stairs' | 'ramp' | 'elevator';

export interface RouteSegment {
  id: string;
  campus_id: string;
  from_node: string;
  to_node: string;
  distance: number;
  accessible: boolean;
  segment_type: RouteSegmentType;
  archived_at?: string | null;
}

// ---------------------------------------------------------------------
// POI externes (OpenStreetMap) — consommés par `osm-poi.ts` pour
// enrichir la carte de points d'intérêt hors périmètre HEC (arrêts,
// commerces alentour, etc.).
//
// ATTENTION : forme provisoire. `osm-poi.ts` n'a pas été fourni au
// moment de cette refactorisation — à confirmer/ajuster contre son
// contenu réel avant de considérer ce type comme définitif.
// ---------------------------------------------------------------------
export type ExternalPOISource = 'osm';

export interface ExternalPOI {
  /** Identifiant du fournisseur externe (ex. "node/123456" pour OSM),
   * distinct des UUID Supabase utilisés ailleurs dans l'app. */
  id: string;
  source: ExternalPOISource;
  name: string;
  category: string;
  /** Longitude du POI externe. */
  lng: number;
  /** Latitude du POI externe. */
  lat: number;
}