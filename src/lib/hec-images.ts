// Les 7 photos officielles du campus HEC Kinshasa fournies par l'établissement.
// Fichiers WebP optimisés dans public/images/hec/ (version complète + version
// 480 px pour mobile). Les descriptions ne décrivent QUE ce que la photo montre.

export interface HecPhoto {
  id: string;
  /** Version complète (810 px de large ou 720 px pour la vue aérienne). */
  src: string;
  /** Version 480 px pour les écrans étroits. */
  small: string;
  width: number;
  height: number;
  alt: string;
  /** Point focal pour `object-position` (recadrage plein écran). */
  position: string;
}

function photo(
  id: string,
  width: number,
  height: number,
  alt: string,
  position = 'center',
): HecPhoto {
  return {
    id,
    src: `/images/hec/${id}.webp`,
    small: `/images/hec/${id}-480.webp`,
    width,
    height,
    alt,
    position,
  };
}

export const HEC_PHOTOS = {
  /** Allée d'entrée du campus, arbres, parking, bâtiment au fond à droite. */
  entrance: photo(
    'hec-hero-01',
    810,
    1080,
    "Allée principale du campus de la Haute École de Commerce de Kinshasa, bordée d'arbres et de pelouses",
    'center 60%',
  ),
  /** Bâtiment de jour, façade à brise-soleil, palmiers au premier plan. */
  buildingPalms: photo(
    'hec-hero-02',
    810,
    1080,
    'Bâtiment du campus HEC Kinshasa de jour, entouré de palmiers et de pelouses',
    'center 55%',
  ),
  /** Bâtiment de jour, angle plongeant, voiture noire à gauche. */
  buildingFacade: photo(
    'hec-hero-03',
    810,
    1080,
    'Façade à brise-soleil d’un bâtiment du campus HEC Kinshasa',
    'center 50%',
  ),
  /** Salle remplie d'étudiants assis à des tables. */
  classroom: photo(
    'hec-campus-01',
    810,
    1080,
    'Salle du campus HEC Kinshasa remplie d’étudiants assis à leurs tables',
    'center 55%',
  ),
  /** Vue aérienne des pelouses et allées (photo paysage 720×540). */
  gardens: photo(
    'hec-campus-02',
    720,
    540,
    'Vue en hauteur des pelouses et des allées du campus HEC Kinshasa',
    'center',
  ),
  /** Nuit : bâtiment éclairé au bout d'une allée. */
  nightBuilding: photo(
    'hec-night-01',
    810,
    1080,
    'Bâtiment illuminé du campus HEC Kinshasa, de nuit, au bout d’une allée',
    'center 45%',
  ),
  /** Nuit : palmier au premier plan, bâtiments éclairés. */
  nightPalm: photo(
    'hec-night-02',
    810,
    1080,
    'Palmier et bâtiments éclairés du campus HEC Kinshasa, de nuit',
    'center 50%',
  ),
} as const;

export interface HeroSlide {
  photo: HecPhoto;
  label: string;
  title: string;
  description: string;
}

/** Ordre du slideshow du hero (boucle infinie, 3 s par image). */
export const HERO_SLIDES: HeroSlide[] = [
  {
    photo: HEC_PHOTOS.buildingPalms,
    label: 'Haute École de Commerce de Kinshasa',
    title: 'Découvrez votre campus',
    description:
      'Explorez les espaces, services et bâtiments de votre campus depuis une carte interactive.',
  },
  {
    photo: HEC_PHOTOS.entrance,
    label: 'Vie du campus',
    title: 'Un campus à portée de carte',
    description:
      'Identifiez rapidement les bâtiments, salles et services dont vous avez besoin.',
  },
  {
    photo: HEC_PHOTOS.buildingFacade,
    label: 'Bâtiments',
    title: 'Reconnaissez chaque bâtiment',
    description:
      'Repérez les bâtiments du campus en un coup d’œil, avant même d’arriver.',
  },
  {
    photo: HEC_PHOTOS.classroom,
    label: 'Vie académique',
    title: 'Trouvez votre salle',
    description:
      'Retrouvez rapidement les salles et les espaces où se déroulent vos cours.',
  },
  {
    photo: HEC_PHOTOS.gardens,
    label: 'Espaces extérieurs',
    title: 'Suivez les allées du campus',
    description:
      'Pelouses, cheminements, points de repère : gardez le bon cap, pas à pas.',
  },
  {
    photo: HEC_PHOTOS.nightBuilding,
    label: 'Campus de nuit',
    title: 'Vos repères, à toute heure',
    description:
      'Consultez la carte du campus à tout moment depuis votre téléphone.',
  },
  {
    photo: HEC_PHOTOS.nightPalm,
    label: 'Au cœur du campus',
    title: 'Naviguez jusqu’à destination',
    description:
      'Lancez le guidage depuis votre position vers le lieu de votre choix.',
  },
];

export const HERO_INTERVAL_MS = 3000;
