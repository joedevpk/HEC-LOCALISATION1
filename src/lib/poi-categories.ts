// Catalogue des Points d'Intérêt (ÉTAPES 3-4 et 8 du cahier des charges POI).
//
// Deux sources, clairement séparées comme demandé :
// - 'hec'  : lieux internes gérés depuis l'admin (bâtiments/salles déjà
//            existants dans `types.ts` — CampusLocation/Building) ;
// - 'osm'  : lieux publics autour du campus (écoles, hôpitaux, banques…),
//            récupérés dynamiquement depuis OpenStreetMap (voir
//            `osm-poi.ts`). Jamais inventés : si l'API ne répond pas, on
//            affiche une erreur, jamais un lieu fictif.
//
// ÉTAPE 8 — organisation professionnelle : plutôt que plusieurs `Record`
// tenus à la main en parallèle (label ici, couleur là, icône ailleurs —
// avec le risque qu'ils se désynchronisent), chaque catégorie est décrite
// une seule fois dans `POI_CATEGORY_DEFINITIONS` ci-dessous. Tous les
// exports historiques (`POI_CATEGORIES`, `poiCategoryLabels`,
// `poiCategoryColors`, `poiCategorySvgPaths`, `poiCategoryToFilterGroup`…)
// en sont dérivés automatiquement : leur forme et leur contenu restent
// strictement identiques à avant, donc aucun composant existant
// (MapPage, CampusMap, filtres…) n'a besoin de changer.
//
// IDs, groupes de filtre et clés OSM inchangés : ce sont des contrats
// partagés avec Supabase (aucun) et surtout avec `osm-poi.ts`, qui doit
// continuer à produire des `POICategory` reconnus par ce fichier.

export type POICategory =
  | 'school'
  | 'hospital'
  | 'pharmacy'
  | 'stadium'
  | 'bank'
  | 'church'
  | 'restaurant'
  | 'market'
  | 'shop'
  | 'gas_station'
  | 'police'
  | 'government'
  | 'parking'
  | 'transport'
  | 'hotel'
  | 'library'
  | 'other';

export interface ExternalPOI {
  id: string; // "osm:node/12345" — préfixé pour ne jamais entrer en collision avec un id HEC
  name: string;
  category: POICategory;
  lng: number;
  lat: number;
  description?: string;
  source: 'osm';
}

/** Regroupement pour la barre de filtres (ÉTAPE 10) — moins de boutons
 * qu'il n'y a de catégories brutes, plus lisible sur mobile. Union
 * inchangée : un composant qui teste un groupe précis (ex. `=== 'money'`)
 * continue de fonctionner. */
export type POIFilterGroup =
  | 'all'
  | 'hec'
  | 'education'
  | 'health'
  | 'money'
  | 'food'
  | 'shopping'
  | 'sport'
  | 'transport'
  | 'services'
  | 'other';

/**
 * Définition complète d'une catégorie POI — source de vérité unique.
 *
 * `id` sert aussi de clé i18n implicite : le jour où l'app gère plusieurs
 * langues, une table `translations[locale][id]` peut remplacer `label`/
 * `shortLabel`/`description` sans toucher aux ids ni aux composants qui
 * les utilisent déjà (compatibilité i18n préparée sans système complexe
 * ajouté aujourd'hui).
 */
export interface POICategoryDefinition {
  /** Identifiant stable — ne jamais renommer, c'est un contrat avec OSM
   * (`osm-poi.ts`) et avec l'historique des favoris/recherches. */
  id: POICategory;
  /** Libellé complet en français, pour listes et infobulles. */
  label: string;
  /** Libellé court pour puces de filtre mobile / espace restreint. */
  shortLabel: string;
  /** Une phrase expliquant ce que couvre la catégorie (infobulle, aide). */
  description: string;
  /** Groupe de filtre auquel rattacher cette catégorie. */
  group: POIFilterGroup;
  /** Couleur de marqueur/puce (hex). */
  color: string;
  /** Tracé SVG (viewBox 0 0 24 24), jamais un emoji (ÉTAPE 4). */
  svgPath: string;
  /** Clés/valeurs OSM (amenity/shop/leisure/tourism/railway/highway)
   * dont provient cette catégorie — documentation pour garder
   * `osm-poi.ts` et ce fichier synchronisés lors de futures évolutions ;
   * n'est pas consommé par le code, seulement par les développeurs. */
  osmKeys: string[];
  /** Ordre d'affichage (catégories principales avant secondaires). */
  order: number;
  /** Si `false`, la catégorie existe mais n'apparaît pas comme filtre
   * autonome (réservé pour une évolution future ; toutes filtrables
   * aujourd'hui). */
  filterable: boolean;
}

/**
 * Registre unique des catégories, dans l'ordre d'affichage voulu
 * (catégories les plus consultées d'abord). L'ordre reproduit
 * exactement celui de l'ancien tableau `POI_CATEGORIES` pour ne rien
 * changer visuellement par défaut.
 */
const POI_CATEGORY_REGISTRY: readonly POICategoryDefinition[] = [
  {
    id: 'school',
    label: 'École',
    shortLabel: 'École',
    description: 'Écoles, universités, collèges et lycées.',
    group: 'education',
    color: '#7c3aed',
    svgPath: 'M12 3 1 9l11 6 9-4.9V17h2V9L12 3Z M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82Z',
    osmKeys: ['amenity=school', 'amenity=university', 'amenity=college', 'amenity=kindergarten'],
    order: 0,
    filterable: true,
  },
  {
    id: 'hospital',
    label: 'Hôpital',
    shortLabel: 'Hôpital',
    description: 'Hôpitaux, cliniques et cabinets médicaux.',
    group: 'health',
    color: '#dc2626',
    svgPath: 'M11 4h2v6h6v2h-6v6h-2v-6H5v-2h6V4Z M4 4h16v16H4V4Z',
    osmKeys: ['amenity=hospital', 'amenity=clinic', 'amenity=doctors'],
    order: 1,
    filterable: true,
  },
  {
    id: 'pharmacy',
    label: 'Pharmacie',
    shortLabel: 'Pharma.',
    description: 'Pharmacies.',
    group: 'health',
    color: '#e11d48',
    svgPath: 'M11 4h2v6h6v2h-6v6h-2v-6H5v-2h6V4Z',
    osmKeys: ['amenity=pharmacy'],
    order: 2,
    filterable: true,
  },
  {
    id: 'stadium',
    label: 'Stade / sport',
    shortLabel: 'Sport',
    description: 'Stades, terrains et centres sportifs.',
    group: 'sport',
    color: '#16a34a',
    svgPath:
      'M12 3a9 9 0 1 0 .001 18.001A9 9 0 0 0 12 3Zm0 2c1.1 0 2.13.24 3.06.66L12 9.5 8.94 5.66A6.93 6.93 0 0 1 12 5Zm-6.9 6.06 3.84 2.98-1.47 4.6A6.98 6.98 0 0 1 5.1 11.06Zm3.75 8.53 1.47-4.6h4.16l1.47 4.6a6.94 6.94 0 0 1-7.1 0Zm8.55-.93-1.47-4.6 3.84-2.98a6.98 6.98 0 0 1-2.37 7.58Z',
    osmKeys: ['leisure=stadium', 'leisure=sports_centre', 'leisure=pitch'],
    order: 3,
    filterable: true,
  },
  {
    id: 'bank',
    label: 'Banque',
    shortLabel: 'Banque',
    description: 'Banques et distributeurs associés.',
    group: 'money',
    color: '#0891b2',
    svgPath: 'M12 2 2 8h20L12 2Z M4 10v9H2v2h20v-2h-2v-9h-2v9h-3v-9h-2v9h-3v-9H8v9H6v-9H4Z',
    osmKeys: ['amenity=bank'],
    order: 4,
    filterable: true,
  },
  {
    id: 'church',
    label: 'Église',
    shortLabel: 'Église',
    description: 'Lieux de culte.',
    group: 'other',
    color: '#78716c',
    svgPath:
      'M11 2h2v2h2v2h-2v1.1a7 7 0 0 1 5 6.4V21h-2v-2H8v2H6v-7.5a7 7 0 0 1 5-6.4V6H9V4h2V2ZM8 12.9V17h8v-4.1a5 5 0 0 0-8 0Z',
    osmKeys: ['amenity=place_of_worship'],
    order: 5,
    filterable: true,
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    shortLabel: 'Resto',
    description: 'Restaurants, snacks rapides et cafés.',
    group: 'food',
    color: '#ea580c',
    svgPath:
      'M7 2v8a2 2 0 0 0 2 2v10h2V12a2 2 0 0 0 2-2V2h-2v6H10V2H8v6H7V2H7Z M17 2c-1.66 0-3 2.24-3 5s1.34 5 3 5v10h2V2h-2Z',
    osmKeys: ['amenity=restaurant', 'amenity=fast_food', 'amenity=cafe'],
    order: 6,
    filterable: true,
  },
  {
    id: 'market',
    label: 'Marché',
    shortLabel: 'Marché',
    description: 'Marchés, supermarchés et supérettes.',
    group: 'shopping',
    color: '#ca8a04',
    svgPath: 'M4 4h16l-1.5 6h-13L4 4Z M6 10 6 20h12v-10 M9 14h2v4H9v-4Zm4 0h2v4h-2v-4Z',
    osmKeys: ['amenity=marketplace', 'shop=supermarket', 'shop=convenience'],
    order: 7,
    filterable: true,
  },
  {
    id: 'shop',
    label: 'Commerce',
    shortLabel: 'Commerce',
    description: 'Commerces divers, centres commerciaux.',
    group: 'shopping',
    color: '#d97706',
    svgPath: 'M5 7 7 3h10l2 4v2H5V7Z M5 9v12h14V9H5Zm5 2h4v3h-4v-3Z',
    osmKeys: ['shop=mall'],
    order: 8,
    filterable: true,
  },
  {
    id: 'gas_station',
    label: 'Station-service',
    shortLabel: 'Station',
    description: 'Stations-service.',
    group: 'transport',
    color: '#475569',
    svgPath:
      'M4 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15H4Z M6 8h6 M16 8l3 3v6a2 2 0 0 1-2 2h-1v-6h-2v-2h2V9l-2-2 2-1Z M6 12h6v6H6z',
    osmKeys: ['amenity=fuel'],
    order: 9,
    filterable: true,
  },
  {
    id: 'police',
    label: 'Police',
    shortLabel: 'Police',
    description: 'Commissariats et postes de police.',
    group: 'services',
    color: '#1d4ed8',
    svgPath:
      'M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Zm0 2.2 6 2.3v4c0 3.9-2.5 6.9-6 8-3.5-1.1-6-4.1-6-8v-4l6-2.3Z',
    osmKeys: ['amenity=police'],
    order: 10,
    filterable: true,
  },
  {
    id: 'government',
    label: 'Administration',
    shortLabel: 'Admin.',
    description: 'Mairies, tribunaux et administrations publiques.',
    group: 'services',
    color: '#334155',
    svgPath: 'M12 2 2 8h20L12 2Z M4 10v8H2v2h20v-2h-2v-8h-2v8h-3v-8h-2v8h-3v-8H8v8H6v-8H4Z',
    osmKeys: ['amenity=townhall', 'amenity=courthouse'],
    order: 11,
    filterable: true,
  },
  {
    id: 'parking',
    label: 'Parking',
    shortLabel: 'Parking',
    description: 'Zones de stationnement.',
    group: 'transport',
    color: '#0f766e',
    svgPath:
      'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm4 4v10h2.4v-3.4H13a3.3 3.3 0 0 0 0-6.6H9Zm2.4 2h1.2a1.3 1.3 0 0 1 0 2.6h-1.2V9Z',
    osmKeys: ['amenity=parking'],
    order: 12,
    filterable: true,
  },
  {
    id: 'transport',
    label: 'Transport',
    shortLabel: 'Transport',
    description: 'Gares, arrêts de bus et stations de transport public.',
    group: 'transport',
    color: '#4338ca',
    svgPath:
      'M6 3h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-1 16h2l1 2H6l-1-2Zm11 0h2l-1 2h-2l1-2ZM6 7h12v6H6V7Zm0.5 8.5A1.5 1.5 0 1 0 6.5 12a1.5 1.5 0 0 0 0 3.5Zm11 0A1.5 1.5 0 1 0 17.5 12a1.5 1.5 0 0 0 0 3.5Z',
    osmKeys: ['amenity=bus_station', 'railway=station', 'highway=bus_stop'],
    order: 13,
    filterable: true,
  },
  {
    id: 'hotel',
    label: 'Hôtel',
    shortLabel: 'Hôtel',
    description: 'Hôtels et hébergements touristiques.',
    group: 'other',
    color: '#be185d',
    svgPath:
      'M4 4v16h2v-5h12v5h2V10a4 4 0 0 0-4-4h-4V4H4Zm2 2h6v4H6.8A2.8 2.8 0 0 0 6 8.8V6Zm0 6.9c.24-.06.49-.1.75-.1h9.5A2.75 2.75 0 0 1 19 15.5V17H6v-4.1Z',
    osmKeys: ['tourism=hotel', 'tourism=guest_house'],
    order: 14,
    filterable: true,
  },
  {
    id: 'library',
    label: 'Bibliothèque',
    shortLabel: 'Biblio.',
    description: 'Bibliothèques.',
    group: 'education',
    color: '#7c3aed',
    svgPath:
      'M4 4h5.5a2.5 2.5 0 0 1 2.5 2.5V20a2.5 2.5 0 0 0-2.5-2.5H4V4Z M20 4h-5.5A2.5 2.5 0 0 0 12 6.5V20a2.5 2.5 0 0 1 2.5-2.5H20V4Z',
    osmKeys: ['amenity=library'],
    order: 15,
    filterable: true,
  },
  {
    id: 'other',
    label: 'Autre',
    shortLabel: 'Autre',
    description: "Lieux ne correspondant à aucune autre catégorie.",
    group: 'other',
    color: '#64748b',
    svgPath: 'M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z',
    osmKeys: [],
    order: 16,
    filterable: true,
  },
];

/** Accès direct par id, dérivé une fois du registre ci-dessus. */
const POI_CATEGORY_DEFINITIONS: Record<POICategory, POICategoryDefinition> = Object.fromEntries(
  POI_CATEGORY_REGISTRY.map((def) => [def.id, def]),
) as Record<POICategory, POICategoryDefinition>;

/** Retourne la définition complète d'une catégorie (label, groupe,
 * couleur, icône, etc.) — utile pour un composant qui veut tout savoir
 * sur une catégorie sans importer cinq `Record` différents. */
export function getPoiCategoryDefinition(category: POICategory): POICategoryDefinition {
  return POI_CATEGORY_DEFINITIONS[category];
}

/** Toutes les catégories d'un groupe de filtre donné, dans l'ordre
 * d'affichage. Pratique pour construire un sous-menu "Santé" avec
 * Hôpital + Pharmacie sans recoder le filtre à la main. */
export function getPoiCategoriesByGroup(group: POIFilterGroup): POICategoryDefinition[] {
  return POI_CATEGORY_REGISTRY.filter((def) => def.group === group);
}

// ---------------------------------------------------------------------
// Exports historiques — dérivés du registre, forme et contenu identiques
// à l'ancienne version : aucun composant existant n'a besoin de changer.
// ---------------------------------------------------------------------

export const POI_CATEGORIES: POICategory[] = [...POI_CATEGORY_REGISTRY]
  .sort((a, b) => a.order - b.order)
  .map((def) => def.id);

export const poiCategoryLabels: Record<POICategory, string> = Object.fromEntries(
  POI_CATEGORY_REGISTRY.map((def) => [def.id, def.label]),
) as Record<POICategory, string>;

/** Nouveau (non cassant) : libellés courts pour puces de filtre mobile. */
export const poiCategoryShortLabels: Record<POICategory, string> = Object.fromEntries(
  POI_CATEGORY_REGISTRY.map((def) => [def.id, def.shortLabel]),
) as Record<POICategory, string>;

/** Nouveau (non cassant) : description longue, pour infobulles/aide. */
export const poiCategoryDescriptions: Record<POICategory, string> = Object.fromEntries(
  POI_CATEGORY_REGISTRY.map((def) => [def.id, def.description]),
) as Record<POICategory, string>;

export const poiCategoryColors: Record<POICategory, string> = Object.fromEntries(
  POI_CATEGORY_REGISTRY.map((def) => [def.id, def.color]),
) as Record<POICategory, string>;

export const poiCategorySvgPaths: Record<POICategory, string> = Object.fromEntries(
  POI_CATEGORY_REGISTRY.map((def) => [def.id, def.svgPath]),
) as Record<POICategory, string>;

export const poiCategoryToFilterGroup: Record<POICategory, POIFilterGroup> = Object.fromEntries(
  POI_CATEGORY_REGISTRY.map((def) => [def.id, def.group]),
) as Record<POICategory, POIFilterGroup>;

export const poiFilterGroupLabels: Record<POIFilterGroup, string> = {
  all: 'Tous',
  hec: 'HEC',
  education: 'Écoles',
  health: 'Santé',
  money: 'Banques',
  food: 'Restaurants',
  shopping: 'Commerces',
  sport: 'Sport',
  transport: 'Transport',
  services: 'Services',
  other: 'Autres',
};

/**
 * Nouveau (non cassant) : ordre d'affichage suggéré des groupes de
 * filtre — catégories principales avant secondaires (ÉTAPE 8, UX). Ne
 * change pas l'ordre des clés de `poiFilterGroupLabels` (au cas où un
 * composant en dépendrait déjà) ; un composant de filtre peut adopter ce
 * tableau progressivement sans rien casser aujourd'hui.
 */
export const POI_FILTER_GROUP_ORDER: POIFilterGroup[] = [
  'all',
  'hec',
  'education',
  'health',
  'transport',
  'food',
  'shopping',
  'money',
  'services',
  'sport',
  'other',
];