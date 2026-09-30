import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Compass,
  Crosshair,
  Layers,
  Loader2,
  Map as MapIcon,
  MapPin,
  Mountain,
  Moon,
  Navigation,
  Satellite,
  Search as SearchIcon,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { CampusLocation } from '@/lib/types';
import { isValidLatitude, isValidLongitude } from '@/lib/geo-validation';
import type { ExternalPOI, POIFilterGroup } from '@/lib/poi-categories';
import { poiCategoryToFilterGroup } from '@/lib/poi-categories';
import { fetchExternalPOIs, isUserAbort } from '@/lib/osm-poi';
import { useCampus } from '@/context/CampusContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, useRoute } from '@/lib/router';
import { CampusMap } from '@/components/CampusMap';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LocationDetail } from '@/components/LocationDetail';
import { ExternalPOIDetail } from '@/components/ExternalPOIDetail';
import { LocationSearch } from '@/components/LocationSearch';
import { POIFilters } from '@/components/POIFilters';
import { RoutePanel } from '@/components/RoutePanel';
import { Button, EmptyState, Spinner } from '@/components/ui';
import {
  findRoute,
  distanceToPolylineMeters,
  haversine,
  type RouteResult,
  type RouteError,
} from '@/lib/nav';
import { getRecentSearches } from '@/lib/api';
import { buildingCategoryLabels } from '@/lib/display';
import { MAP_STYLE_MODES, mapStyleLabels, type MapStyleMode } from '@/lib/map-config';
import {
  accuracyTierLabels,
  formatAccuracy,
  getGeolocationPermissionState,
  isBetterFix,
  isPreciseEnoughForRouting,
  isTrustworthy,
  LOW_ACCURACY_HINT,
  PRECISE_ACCURACY_METERS,
  startLocationWatch,
  type GeoFix,
  type GeolocationPermissionState,
} from '@/lib/geolocation';
import { GeoDiagnosticPanel } from '@/components/GeoDiagnosticPanel';

type PanelMode = 'search' | 'detail' | 'route' | 'poi';
type GeoStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable';

const styleModeIcons: Record<MapStyleMode, React.ComponentType<{ className?: string }>> = {
  plan: MapIcon,
  satellite: Satellite,
  hybrid: Layers,
  topo: Mountain,
  dark: Moon,
};

function hasValidCoords(loc: CampusLocation): boolean {
  return (
    Number.isFinite(loc.lng) &&
    Number.isFinite(loc.lat) &&
    !(loc.lng === 0 && loc.lat === 0)
  );
}

/**
 * Choisit le point à ouvrir/guider quand l'utilisateur clique sur le
 * marqueur d'un bâtiment. Priorité à l'entrée principale (kind === 'entrance')
 * — jamais le centre géométrique du bâtiment — car c'est la seule position
 * réellement atteignable à pied (ÉTAPE 21 du cahier des charges). À défaut
 * d'entrée déclarée, on retombe sur un point d'intérêt du bâtiment, puis sur
 * n'importe quelle salle/lieu existant, plutôt que de ne rien afficher.
 */
function buildingEntryPoint(
  building: { id: string },
  locations: CampusLocation[],
): CampusLocation | null {
  const forBuilding = locations.filter((l) => l.building_id === building.id);
  return (
    forBuilding.find((l) => l.kind === 'entrance') ??
    forBuilding.find((l) => l.kind === 'poi') ??
    forBuilding[0] ??
    null
  );
}

function syntheticOrigin(lngLat: [number, number], label: string): CampusLocation {
  return {
    id: `__origin__${label}`,
    building_id: null,
    floor_id: null,
    name: label,
    code: '',
    kind: 'poi',
    category: 'position',
    description: '',
    capacity: null,
    lng: lngLat[0],
    lat: lngLat[1],
    is_accessible: true,
  };
}

/**
 * Classe une erreur brute (chaîne renvoyée par le contexte / Supabase) en un
 * message utilisateur clair, sans jamais masquer la vraie cause pour le
 * debug (ÉTAPE 11, point "erreurs"). On reste volontairement permissif : si
 * rien ne correspond, on retombe sur un message générique mais on affiche
 * toujours le détail technique dans un <details> repliable.
 */
function classifyCampusError(raw: string): { title: string; description: string } {
  const msg = raw.toLowerCase();
  if (msg.includes('rls') || msg.includes('permission') || msg.includes('policy')) {
    return {
      title: "Accès refusé",
      description:
        "Les règles de sécurité de la base de données empêchent la lecture de ce campus. Contactez un administrateur.",
    };
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
    return {
      title: 'Connexion impossible',
      description:
        'Impossible de joindre le serveur. Vérifiez votre connexion internet puis réessayez.',
    };
  }
  if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('table')) {
    return {
      title: 'Configuration incomplète',
      description:
        "Une table requise est absente ou mal configurée côté serveur. Contactez un administrateur.",
    };
  }
  return {
    title: 'Campus indisponible',
    description: "Impossible de charger les données du campus.",
  };
}

// Libellés courts affichés à côté du bouton "Ma position" selon l'état GPS —
// purement présentationnel, ne modifie aucune logique de geoStatus.
const geoStatusShortLabel: Record<GeoStatus, string> = {
  idle: 'Ma position',
  locating: 'Recherche…',
  granted: 'Position active',
  denied: 'Refusée',
  unavailable: 'Indisponible',
};

/**
 * Traduit un échec de calcul d'itinéraire (`RouteError`, voir lib/nav.ts)
 * en message honnête pour l'utilisateur — jamais un itinéraire fictif à
 * la place : la distance à vol d'oiseau, quand connue, n'est mentionnée
 * qu'en texte, jamais tracée sur la carte (voir routeCoordinates plus
 * bas, qui ne reçoit que route.coordinates d'une VRAIE route calculée).
 */
function routeErrorMessage(err: RouteError): string {
  const asTheCrowFlies =
    typeof err.straightLineDistanceMeters === 'number'
      ? ` (distance à vol d'oiseau : environ ${Math.round(err.straightLineDistanceMeters)} m, non affichée sur la carte)`
      : '';
  switch (err.code) {
    case 'ROUTE_NETWORK_MISSING':
      return "Le réseau piéton de cette zone n'est pas encore configuré. Cette zone doit être configurée par l'administration.";
    case 'ROUTE_NETWORK_UNREACHABLE':
      return `Ce trajet est trop loin du réseau piéton connu pour être calculé${asTheCrowFlies}. Cette zone doit être configurée par l'administration.`;
    case 'ROUTE_NOT_FOUND':
      return `Aucun chemin n'a été trouvé entre ces deux points sur le réseau piéton actuel${asTheCrowFlies}.`;
    case 'ROUTE_ALREADY_AT_DESTINATION':
      return 'Vous êtes déjà à proximité immédiate de la destination.';
    case 'INVALID_ORIGIN':
    case 'INVALID_DESTINATION':
      return 'Coordonnées invalides — impossible de calculer un itinéraire.';
    default:
      return "Impossible de calculer l'itinéraire.";
  }
}

// Un fix GPS ne déplace le départ affiché / ne relance le calcul que s'il
// s'est réellement éloigné du départ courant : le bruit GPS d'un
// utilisateur immobile ne doit pas provoquer de recalcul en boucle.
const ORIGIN_UPDATE_MIN_MOVE_M = 8;

export function MapPage() {
  const {
    campus,
    buildings,
    locations,
    routeNodes,
    routeSegments,
    routingLoading,
    loading,
    error,
    favorites,
    toggleFavorite,
  } = useCampus();
  const { session } = useAuth();
  const route = useRoute();
  const go = useNavigate();

  const [panelMode, setPanelMode] = useState<PanelMode>('search');
  const [selected, setSelected] = useState<CampusLocation | null>(null);
  const [origin, setOrigin] = useState<CampusLocation | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<RouteError | null>(null);
  // Navigation active (ÉTAPE routing #11/12) : uniquement déclenchée par le
  // bouton "Démarrer" de RoutePanel (onStart), jamais automatiquement.
  // Réinitialisée à chaque fermeture du panneau ou changement de
  // destination — jamais reportée sur un nouveau trajet.
  const [navigationActive, setNavigationActive] = useState(false);
  const [accessible, setAccessible] = useState(true);
  const [recent, setRecent] = useState<string[]>([]);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  // PHASE 2 UX : sur mobile, le sélecteur de style et les filtres POI sont
  // repliés par défaut derrière un unique bouton "Filtres" pour rendre à la
  // carte l'espace vertical qu'ils occupaient en permanence — priorité
  // "MAP FIRST" du cahier des charges. Purement présentationnel : aucune
  // valeur de styleMode/poiFilter n'est modifiée par ce repli.
  const [mobileMapControlsOpen, setMobileMapControlsOpen] = useState(false);
  // UX finition : sur mobile, le bandeau "campus" (nom + statut) est replié
  // par défaut en une pastille compacte pour laisser le maximum de place à
  // la carte (progressive disclosure) — purement présentationnel, aucune
  // donnée campus n'est modifiée par ce repli.
  const [mobileCampusOpen, setMobileCampusOpen] = useState(false);
  // UX finition : sur desktop, le panneau gauche (campus / recherche /
  // détail / itinéraire) peut être masqué entièrement à la demande pour
  // libérer temporairement toute la largeur de la carte — purement
  // présentationnel, aucun état de recherche/sélection/itinéraire n'est
  // perdu quand on le referme : on le retrouve tel quel en le rouvrant.
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(true);

  const [styleMode, setStyleMode] = useState<MapStyleMode>('plan');
  const [usingFallbackProvider, setUsingFallbackProvider] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [geoFix, setGeoFix] = useState<GeoFix | null>(null);
  const [manualPickMode, setManualPickMode] = useState(false);
  // Précision (mètres) de l'origine ACTUELLE quand elle vient d'un fix GPS
  // réel — `null` pour une origine choisie manuellement (clic carte ou
  // lieu du campus), qui est par nature exacte. Sert uniquement à afficher
  // un avertissement honnête sur l'itinéraire (ÉTAPE géolocalisation #2),
  // jamais à modifier la position elle-même.
  const [originAccuracyMeters, setOriginAccuracyMeters] = useState<number | null>(null);
  // État de la permission de géolocalisation, interrogé une fois au
  // montage sans jamais déclencher de prompt — purement informatif
  // (préremplit un statut "refusée" honnête + alimente le panneau de
  // diagnostic dev).
  const [geoPermission, setGeoPermission] = useState<GeolocationPermissionState | null>(null);

  // Recherches "secondaires" (ex: historique des recherches récentes) : leur
  // échec ne doit JAMAIS bloquer la page principale (ÉTAPE 11, point 1).
  const [recentError, setRecentError] = useState<string | null>(null);

  // POI externes (OpenStreetMap) — ÉTAPES 3, 6, 9, 10, 17 du cahier des
  // charges POI.
  const [externalPois, setExternalPois] = useState<ExternalPOI[]>([]);
  const [poiLoading, setPoiLoading] = useState(false);
  const [poiError, setPoiError] = useState<string | null>(null);
  const [poiFilter, setPoiFilter] = useState<POIFilterGroup>('all');
  const [selectedPoi, setSelectedPoi] = useState<ExternalPOI | null>(null);
  const mapInstanceRef = useRef<MLMap | null>(null);
  // Déclencheur du GeolocateControl natif de MapLibre, exposé par CampusMap.
  // Le bouton "Ma position" de la page l'utilise en priorité pour éviter de
  // faire tourner deux systèmes GPS en parallèle (celui de MapLibre et
  // celui de lib/geolocation) — voir le commentaire dans CampusMap.tsx.
  const geolocateTriggerRef = useRef<(() => void) | null>(null);
  const poiAbortRef = useRef<AbortController | null>(null);
  const poiDebounceRef = useRef<number | null>(null);

  // Un seul watcher GPS actif à la fois : on garde la fonction d'arrêt
  // renvoyée par startLocationWatch et on l'appelle systématiquement avant
  // d'en démarrer un nouveau, ou au démontage de la page.
  const geoStopRef = useRef<(() => void) | null>(null);
  // Cooldown entre deux recalculs automatiques pendant une navigation
  // active (ÉTAPE routing #11/12) : évite la boucle "GPS update →
  // recalcul → GPS update → recalcul" en cas de bruit GPS soutenu.
  const lastRecalcAtRef = useRef(0);
  // Miroirs en ref de l'état GPS/navigation : lisibles dans les callbacks
  // asynchrones (contrôle GPS MapLibre, watcher) sans être re-créés, et
  // sans logique à effets de bord dans un updater setState (exécuté deux
  // fois en StrictMode).
  const geoFixRef = useRef<GeoFix | null>(null);
  const navigationActiveRef = useRef(false);
  const lastOriginPointRef = useRef<[number, number] | null>(null);
  // Origine du départ courant : 'gps' (suit "Ma position") ou 'manual'
  // (lieu choisi dans la liste / point choisi sur la carte) — un départ
  // choisi à la main n'est JAMAIS écrasé par un nouveau fix GPS.
  const originSourceRef = useRef<'gps' | 'manual' | null>(null);
  navigationActiveRef.current = navigationActive;

  const stopGeolocationWatch = useCallback(() => {
    geoStopRef.current?.();
    geoStopRef.current = null;
  }, []);

  // Ne charge/affiche les POI externes que si le filtre actif peut en
  // montrer (le filtre "HEC" masque volontairement tous les POI publics).
  const showExternalPois = poiFilter !== 'hec';

  const loadPoisForCurrentView = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const b = map.getBounds();
    poiAbortRef.current?.abort();
    const controller = new AbortController();
    poiAbortRef.current = controller;
    setPoiLoading(true);
    fetchExternalPOIs(
      { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
      controller.signal,
    )
      .then((pois) => {
        // Requête périmée (une plus récente a déjà pris sa place) : ne
        // touche pas à l'état, sous peine d'écraser le résultat/l'erreur
        // de la requête active avec ceux d'une requête obsolète.
        if (poiAbortRef.current !== controller) return;
        setExternalPois(pois);
        setPoiError(null);
      })
      .catch((err: Error) => {
        if (poiAbortRef.current !== controller) return;
        // Annulation volontaire (nouvelle requête lancée, démontage…) :
        // jamais une erreur utilisateur, donc rien à afficher (AbortError
        // natif du fetch, ou OverpassError de type 'abort' levé par
        // fetchExternalPOIs une fois la requête déjà résolue côté réseau).
        if (err.name === 'AbortError' || isUserAbort(err)) return;
        // Échec des POI publics : ne jamais faire tomber toute la carte,
        // seulement signaler l'échec localement (ÉTAPE 11 / ÉTAPE 18).
        setPoiError(err.message || "Impossible de charger les lieux à proximité.");
      })
      .finally(() => {
        // Idem : une ancienne requête annulée ne doit pas arrêter
        // l'indicateur de chargement d'une requête plus récente encore
        // en cours.
        if (poiAbortRef.current !== controller) return;
        setPoiLoading(false);
      });
  }, []);

  const handleMapReady = useCallback(
    (map: MLMap) => {
      mapInstanceRef.current = map;
      loadPoisForCurrentView();
      const onMoveEnd = () => {
        if (poiDebounceRef.current) window.clearTimeout(poiDebounceRef.current);
        // Debounce (ÉTAPE 17) : on attend que l'utilisateur arrête de
        // bouger la carte avant d'interroger Overpass, jamais à chaque
        // frame de déplacement.
        poiDebounceRef.current = window.setTimeout(loadPoisForCurrentView, 700);
      };
      map.on('moveend', onMoveEnd);
      // Le listener doit être retiré si la carte est recréée/démontée,
      // sinon on accumule des abonnements 'moveend' dupliqués.
      map.once('remove', () => map.off('moveend', onMoveEnd));
    },
    [loadPoisForCurrentView],
  );

  const filteredExternalPois = useMemo(() => {
    if (!showExternalPois) return [];
    if (poiFilter === 'all') return externalPois;
    return externalPois.filter((p) => poiCategoryToFilterGroup[p.category] === poiFilter);
  }, [externalPois, poiFilter, showExternalPois]);

  const openExternalPoi = useCallback((poi: ExternalPOI) => {
    setSelectedPoi(poi);
    setPanelMode('poi');
    setMobileSearchOpen(false);
  }, []);

  const poiLocations = useMemo(
    () => locations.filter((l) => !l.building_id || l.kind !== 'room'),
    [locations],
  );

  // All possible departure points offered in the RoutePanel dropdown:
  // the live/manual position first (if any), then every real campus location.
  const originChoices = useMemo(
    () => (origin && origin.id.startsWith('__origin__') ? [origin, ...locations] : locations),
    [origin, locations],
  );

  // Nettoyage global au démontage : watcher GPS, requête POI en cours et
  // debounce en attente ne doivent pas survivre à la page.
  useEffect(() => {
    return () => {
      stopGeolocationWatch();
      poiAbortRef.current?.abort();
      if (poiDebounceRef.current) window.clearTimeout(poiDebounceRef.current);
    };
  }, [stopGeolocationWatch]);

  useEffect(() => {
    if (!session) return;
    getRecentSearches(session.user.id)
      .then(setRecent)
      .catch(() => {
        // Ressource secondaire : on garde une trace pour le debug mais on
        // ne bloque jamais la recherche elle-même.
        setRecentError("Historique des recherches indisponible.");
      });
  }, [session]);

  // Préflight permission (facultatif, jamais bloquant) : reflète un refus
  // déjà connu du navigateur avant même que l'utilisateur ne clique sur
  // "Ma position", sans jamais provoquer de prompt nous-mêmes. Si l'API
  // Permissions n'est pas disponible, geoPermission reste 'unsupported' et
  // le comportement existant (clic -> vraie demande navigateur) est
  // inchangé.
  useEffect(() => {
    let cancelled = false;
    getGeolocationPermissionState().then((state) => {
      if (cancelled) return;
      setGeoPermission(state);
      if (state === 'denied' && geoStatus === 'idle') {
        setGeoStatus('denied');
        setGeoMessage('Accès à la position refusé. Vous pouvez sélectionner manuellement votre point de départ.');
      }
    });
    return () => {
      cancelled = true;
    };
    // Un seul préflight au montage de la page : la permission peut ensuite
    // changer suite à une vraie demande, gérée par requestGeolocation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Applique un fix GPS uniquement s'il ameliore (ou remplace un fix perime
  // par) la position deja connue : on ne remplace jamais une position
  // fiable par une position degradee soudaine (ETAPE 4 : cas "RDC affiche
  // en Belgique") — mais un fix plus récent de même palier remplace
  // toujours le précédent, pour que la position suive l'utilisateur qui
  // marche (voir isBetterFix).
  //
  // Seuils réels (lib/geolocation.ts) : ≤100 m -> exploitable pour un
  // itinéraire précis ; >1000 m -> trop imprécis, jamais présenté comme
  // fiable. Entre les deux (palier "approximate"), la position est
  // affichée honnêtement comme approximative mais reste utilisable.
  const applyGeoFix = useCallback((fix: GeoFix) => {
    if (!isBetterFix(fix, geoFixRef.current)) return;
    geoFixRef.current = fix;
    setGeoFix(fix);
    setGeoStatus('granted');
    const preciseEnough = isPreciseEnoughForRouting(fix);
    setGeoMessage(
      !isTrustworthy(fix) && fix.tier !== 'unreliable'
        ? 'Position obsolète — nouvelle recherche de position en cours.'
        : preciseEnough
          ? null
          : `${LOW_ACCURACY_HINT} (${formatAccuracy(fix.accuracy)})`,
    );

    // Pendant une navigation active, le départ ne bouge PAS à chaque fix :
    // c'est l'effet de suivi hors-itinéraire (cooldown + seuil lié à la
    // précision) qui décide seul d'un éventuel recalcul.
    if (navigationActiveRef.current) return;
    // Départ choisi à la main : jamais écrasé par le GPS.
    if (originSourceRef.current === 'manual') return;

    const point: [number, number] = [fix.lng, fix.lat];
    const last = lastOriginPointRef.current;
    if (last && haversine(last, point) < ORIGIN_UPDATE_MIN_MOVE_M) {
      // Immobile (bruit GPS) : on garde le départ et l'itinéraire tels quels.
      return;
    }
    lastOriginPointRef.current = point;
    originSourceRef.current = 'gps';
    setOriginAccuracyMeters(fix.accuracy);
    setOrigin(syntheticOrigin(point, preciseEnough ? 'Ma position' : 'Ma position (approximative)'));
  }, []);

  // UN SEUL suivi GPS actif : le contrôle natif MapLibre quand la carte
  // est prête (il expose déjà la flèche/le point "Vous êtes ici" et
  // renvoie ses fixes via applyGeoFix) ; startLocationWatch n'est qu'un
  // repli si la carte n'a pas encore fini de se charger. On coupe
  // toujours le watcher de repli avant de solliciter le contrôle, pour ne
  // jamais avoir deux watchPosition en parallèle.
  const locate = useCallback(
    (useAsOrigin: boolean) => {
      if (useAsOrigin) {
        originSourceRef.current = 'gps';
        lastOriginPointRef.current = null;
        // Un fix déjà fiable et récent : on l'utilise tout de suite comme
        // départ (le contrôle natif ne ré-émettra pas forcément de fix).
        const known = geoFixRef.current;
        if (known && isTrustworthy(known)) {
          const point: [number, number] = [known.lng, known.lat];
          lastOriginPointRef.current = point;
          setOriginAccuracyMeters(known.accuracy);
          setOrigin(
            syntheticOrigin(
              point,
              isPreciseEnoughForRouting(known) ? 'Ma position' : 'Ma position (approximative)',
            ),
          );
        }
      }
      const hasFreshFix = !!geoFixRef.current && isTrustworthy(geoFixRef.current);
      if (!hasFreshFix) {
        setGeoStatus('locating');
        setGeoMessage(null);
      }
      stopGeolocationWatch();
      if (geolocateTriggerRef.current) {
        geolocateTriggerRef.current();
        return;
      }
      const stop = startLocationWatch(applyGeoFix, (err) => {
        setGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
        setGeoMessage(
          err.code === err.PERMISSION_DENIED
            ? 'Accès à la position refusé. Vous pouvez sélectionner manuellement votre point de départ.'
            : "Votre position n'est pas disponible.",
        );
      });
      if (typeof stop === 'function') {
        geoStopRef.current = stop;
      }
    },
    [applyGeoFix, stopGeolocationWatch],
  );

  // "Ma position" comme DÉPART de l'itinéraire (RoutePanel, auto-démarrage).
  const requestGeolocation = useCallback(() => locate(true), [locate]);

  // Changement d'origine depuis le sélecteur du RoutePanel (dropdown) :
  // ré-choisir la même origine GPS (id __origin__) conserve sa précision
  // connue ; choisir un vrai lieu du campus retombe à `null` (coordonnées
  // exactes, aucune notion de précision GPS à afficher) et fige le départ
  // (le GPS ne le remplacera plus).
  const handleChangeOrigin = useCallback(
    (id: string) => {
      const o = originChoices.find((l) => l.id === id);
      if (!o) return;
      const isGps = o.id.startsWith('__origin__');
      originSourceRef.current = isGps ? originSourceRef.current ?? 'gps' : 'manual';
      setOrigin(o);
      setOriginAccuracyMeters(isGps ? originAccuracyMeters : null);
    },
    [originChoices, originAccuracyMeters],
  );

  // Avertissement honnête (jamais bloquant) affiché sur l'itinéraire quand
  // l'origine active vient d'une lecture GPS réelle peu précise — le
  // calcul reste réel, seule sa fiabilité est qualifiée. `null` : rien à
  // signaler (origine précise ou non-GPS).
  const originWarning = useMemo(() => {
    if (originAccuracyMeters === null || originAccuracyMeters <= PRECISE_ACCURACY_METERS) {
      return null;
    }
    if (originAccuracyMeters <= 1000) {
      return `${LOW_ACCURACY_HINT} (${formatAccuracy(originAccuracyMeters)})`;
    }
    return `${LOW_ACCURACY_HINT} Position de départ imprécise (${formatAccuracy(originAccuracyMeters)}) — cet itinéraire est approximatif. Il se précisera automatiquement dès qu'une meilleure position sera disponible.`;
  }, [originAccuracyMeters]);

  // Bouton "Ma position" / "Recentrer" de la carte : recentre, sans
  // changer un départ choisi à la main.
  const handleLocateClick = useCallback(() => locate(false), [locate]);

  // Sélectionne une destination "à consulter" (recherche, clic bâtiment,
  // clic POI HEC, deep-link ?loc=) : centre la carte + ouvre le détail.
  const selectDestination = useCallback((loc: CampusLocation) => {
    setSelected(loc);
    setSelectedPoi(null);
    setPanelMode('detail');
    setMobileSearchOpen(false);
    setLocationError(null);
  }, []);

  // Sélectionne une destination "à rejoindre" (bouton Itinéraire, deep-link
  // ?nav=) : valide les coordonnées, ouvre le RoutePanel, et ne déclenche la
  // géolocalisation que si elle n'a pas déjà été demandée.
  const selectRouteDestination = useCallback(
    (destination: CampusLocation) => {
      if (!hasValidCoords(destination)) {
        setLocationError("Ce lieu n'a pas encore été géolocalisé par l'administration.");
        return;
      }
      setLocationError(null);
      setSelected(destination);
      setSelectedPoi(null);
      setPanelMode('route');
      setNavigationActive(false);
      setMobileSearchOpen(false);
      // Aucun effet de bord dans un updater setState (StrictMode l'exécute
      // deux fois et lancerait deux suivis GPS).
      if (!origin && geoStatus === 'idle') requestGeolocation();
    },
    [origin, geoStatus, requestGeolocation],
  );

  // Deep-link: ?loc=<id> ouvre le détail; ?nav=<id> ouvre directement
  // l'itinéraire (ÉTAPE 8 : résoudre, sélectionner, centrer, permettre le
  // guidage — même logique que les interactions manuelles, pas de chemin
  // parallèle qui pourrait diverger).
  useEffect(() => {
    if (!locations.length) return;
    const locId = route.params.get('loc');
    const navId = route.params.get('nav');
    if (locId) {
      const loc = locations.find((l) => l.id === locId);
      if (loc) selectDestination(loc);
    } else if (navId) {
      const loc = locations.find((l) => l.id === navId);
      if (loc) selectRouteDestination(loc);
    }
    // On ne veut relancer cet effet que quand les paramètres d'URL ou la
    // liste des lieux changent, pas à chaque changement d'état interne.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params, locations]);

  // Compute route when origin/destination/accessible change. Utilise le
  // graphe reel du campus (route_nodes/route_segments) quand disponible.
  // findRoute() (lib/nav.ts) ne renvoie JAMAIS une route fictive : en cas
  // d'échec (réseau absent, point trop loin du réseau, aucun chemin
  // trouvé...), routeResult reste null et routeError porte la cause
  // exacte — jamais de ligne droite envoyée à routeCoordinates/CampusMap
  // pour "faire comme si" un itinéraire existait.
  useEffect(() => {
    if (panelMode !== 'route' || !origin || !selected) {
      setRouteResult(null);
      setRouteError(null);
      setNavigationActive(false);
      return;
    }
    // Réseau piéton encore en chargement : on attend au lieu d'afficher à
    // tort "réseau non configuré".
    if (routingLoading) {
      setRouteResult(null);
      setRouteError(null);
      return;
    }
    const outcome = findRoute(origin, selected, accessible, routeNodes, routeSegments);
    if (outcome.ok) {
      setRouteResult(outcome.route);
      setRouteError(null);
    } else {
      setRouteResult(null);
      setRouteError(outcome.error);
    }
  }, [panelMode, origin, selected, accessible, routeNodes, routeSegments, routingLoading]);

  // Navigation active : suivi hors-itinéraire + recalcul sûr (ÉTAPE
  // routing #11/12). Réutilise le geoFix déjà mis à jour par le suivi GPS
  // existant (aucun second watchPosition). Ne recalcule que si :
  // - la navigation a été explicitement démarrée (onStart) ;
  // - une route réelle est affichée (jamais pendant un état d'erreur) ;
  // - le dernier fix GPS est fiable (jamais périmé/imprécis, cf.
  //   isTrustworthy) ;
  // - la distance au tracé dépasse un seuil qui tient compte de la
  //   précision GPS réelle (jamais une constante arbitraire figée) ;
  // - le cooldown depuis le dernier recalcul est écoulé (évite la boucle
  //   GPS update → recalcul → GPS update → recalcul).
  // En cas d'échec du recalcul, on NE remplace PAS le dernier itinéraire
  // valide par une erreur soudaine pendant que l'utilisateur marche : on
  // retente au prochain cycle GPS, une fois le cooldown écoulé.
  useEffect(() => {
    if (!navigationActive || !routeResult || !selected || !geoFix) return;
    if (!isTrustworthy(geoFix)) return;
    const OFF_ROUTE_BASE_METERS = 25;
    const RECALC_COOLDOWN_MS = 8_000;
    const threshold = OFF_ROUTE_BASE_METERS + geoFix.accuracy;
    const distance = distanceToPolylineMeters([geoFix.lng, geoFix.lat], routeResult.coordinates);
    if (distance <= threshold) return;
    const now = Date.now();
    if (now - lastRecalcAtRef.current < RECALC_COOLDOWN_MS) return;
    lastRecalcAtRef.current = now;
    const recalcOrigin = syntheticOrigin([geoFix.lng, geoFix.lat], 'Ma position');
    const outcome = findRoute(recalcOrigin, selected, accessible, routeNodes, routeSegments);
    if (outcome.ok) {
      originSourceRef.current = 'gps';
      lastOriginPointRef.current = [geoFix.lng, geoFix.lat];
      setOrigin(recalcOrigin);
      setOriginAccuracyMeters(geoFix.accuracy);
      setRouteResult(outcome.route);
      setRouteError(null);
    }
    // Échec du recalcul : on garde volontairement le dernier itinéraire
    // valide (jamais de route supprimée pendant que l'utilisateur marche).
  }, [navigationActive, routeResult, selected, geoFix, accessible, routeNodes, routeSegments]);

  const startRoute = useCallback(
    (destination: CampusLocation) => selectRouteDestination(destination),
    [selectRouteDestination],
  );

  const openLocation = useCallback(
    (loc: CampusLocation) => selectDestination(loc),
    [selectDestination],
  );

  const closePanel = useCallback(() => {
    originSourceRef.current = null;
    lastOriginPointRef.current = null;
    setSelected(null);
    setSelectedPoi(null);
    setRouteResult(null);
    setRouteError(null);
    setNavigationActive(false);
    setPanelMode('search');
    setManualPickMode(false);
    if (route.params.get('loc') || route.params.get('nav')) {
      go('/map');
    }
  }, [route.params, go]);

  if (loading) return <Spinner label="Chargement du campus…" />;

  if (error || !campus) {
    const { title, description } = classifyCampusError(error ?? 'unknown');
    return (
      <div className="grid h-full place-items-center p-6">
        <EmptyState icon={<MapPin className="h-5 w-5" />} title={title} description={description} />
        {error && (
          <details className="mt-4 max-w-md text-left text-xs text-slate-400">
            <summary className="cursor-pointer select-none">Détail technique</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">{error}</pre>
          </details>
        )}
      </div>
    );
  }

  // Garde-fou : un centre de campus non configuré (coordonnées absentes ou
  // hors bornes valides) ne doit jamais créer la carte avec une position
  // inventée (ex. (0,0)) — on affiche un état explicite à la place, en
  // attendant qu'un administrateur configure la position réelle du campus.
  if (!isValidLongitude(campus.center_lng) || !isValidLatitude(campus.center_lat)) {
    return (
      <div className="grid h-full place-items-center p-6">
        <EmptyState
          icon={<MapPin className="h-5 w-5" />}
          title="Position du campus non configurée"
          description="Ce campus n'a pas encore de coordonnées valides. Configurez-les depuis l'administration avant d'afficher la carte."
        />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
      <ErrorBoundary
        title="La carte rencontre un problème."
        description="Le reste de l'application continue de fonctionner — vous pouvez réessayer d'afficher la carte."
      >
        <CampusMap
          key={mapKey}
          campus={campus}
          buildings={buildings}
          poiLocations={poiLocations}
          externalPois={filteredExternalPois}
          focusLocation={panelMode === 'detail' || panelMode === 'route' ? selected : null}
          originLocation={panelMode === 'route' ? origin : null}
          routeCoordinates={routeResult?.coordinates ?? null}
          styleMode={styleMode}
          manualPickMode={manualPickMode}
          onSelectBuilding={(b) => {
            const loc = buildingEntryPoint(b, locations);
            if (loc) openLocation(loc);
          }}
          onSelectLocation={openLocation}
          onSelectExternalPOI={openExternalPoi}
          onManualPick={(lngLat) => {
            stopGeolocationWatch();
            originSourceRef.current = 'manual';
            setOrigin(syntheticOrigin(lngLat, 'Position choisie'));
            // Un point choisi à la main sur la carte est exact par
            // construction : ce n'est plus une lecture GPS, donc plus de
            // précision GPS à signaler sur l'itinéraire.
            setOriginAccuracyMeters(null);
            setManualPickMode(false);
            setGeoStatus('granted');
            setGeoMessage(null);
          }}
          onGeolocate={applyGeoFix}
          onGeolocateError={(message, code) => {
            setGeoStatus(code === 1 ? 'denied' : 'unavailable');
            setGeoMessage(message);
          }}
          onMapError={setMapError}
          onMapReady={handleMapReady}
          onFallbackProvider={setUsingFallbackProvider}
          onGeolocateControlReady={(trigger) => {
            geolocateTriggerRef.current = trigger;
          }}
        />
      </ErrorBoundary>

      {/* Ajustements de présentation des contrôles MapLibre natifs
          (zoom / plein écran / GPS, ajoutés par CampusMap en bas à droite) :
          cibles tactiles ≥44px sur mobile, respect des safe areas, et le
          bouton plein écran (peu utile sur téléphone) est masqué en dessous
          de 1024px pour laisser plus de place à la carte. Purement visuel :
          CampusMap.tsx et sa logique ne sont pas modifiés. */}
      <style>{`
        .maplibregl-ctrl-bottom-right {
          margin-right: max(0.75rem, env(safe-area-inset-right)) !important;
          margin-bottom: max(0.75rem, env(safe-area-inset-bottom)) !important;
        }
        .maplibregl-ctrl-group button {
          width: 40px !important;
          height: 40px !important;
        }
        @media (max-width: 1023px) {
          .maplibregl-ctrl-group button {
            width: 44px !important;
            height: 44px !important;
          }
          .maplibregl-ctrl-fullscreen {
            display: none !important;
          }
        }
      `}</style>

      {/* ————————————————————— Panneau gauche desktop ————————————————————— */}
      {/* Repliable : "Masquer" rend toute la largeur à la carte sans rien
          perdre (recherche/sélection/itinéraire restent en mémoire dans
          les états React existants) ; un onglet discret sur le bord
          gauche permet de le rouvrir. */}
      {desktopPanelOpen && (
        <aside className="pointer-events-none absolute inset-y-4 left-4 z-20 hidden w-[392px] flex-col gap-3 lg:flex">
          <div className="pointer-events-auto flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 shadow-panel backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-hec-950 text-white">
                <Compass className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-base font-bold leading-tight text-hec-950">
                  {campus.name}
                </h1>
                <p className="mt-0.5 truncate text-xs text-slate-500">{campus.tagline}</p>
              </div>
              <div
                className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700"
                title="Données du campus chargées"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Actif
              </div>
              <button
                onClick={() => setDesktopPanelOpen(false)}
                aria-label="Masquer le panneau et afficher la carte en plein écran"
                title="Masquer le panneau"
                className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-hec-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Filtres POI rapides */}
            <div className="border-b border-slate-100 px-4 py-3">
              <POIFilters active={poiFilter} onChange={setPoiFilter} />
            </div>

            {/* Contenu scrollable : recherche / détail / itinéraire */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {locationError && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {locationError}
              </div>
            )}

            {panelMode === 'search' && (
              <>
                <LocationSearch locations={locations} recent={recent} onSelect={openLocation} />
                {recentError && (
                  <p className="mt-2 text-[11px] text-slate-400">{recentError}</p>
                )}
              </>
            )}

            {panelMode === 'poi' && selectedPoi && (
              <ExternalPOIDetail
                poi={selectedPoi}
                userLng={geoFix?.lng}
                userLat={geoFix?.lat}
                onClose={closePanel}
              />
            )}

            {panelMode === 'detail' && selected && (
              <LocationDetail
                location={selected}
                isFavorite={favorites.has(selected.id)}
                canFavorite={Boolean(session)}
                onToggleFavorite={() => toggleFavorite(selected.id)}
                onNavigate={() => startRoute(selected)}
                onClose={closePanel}
              />
            )}

            {panelMode === 'route' && selected && origin && !routeResult && !routeError && routingLoading && (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500" role="status">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                Chargement du réseau piéton…
              </div>
            )}

            {panelMode === 'route' && selected && origin && (routeResult || routeError) && (
              <RoutePanel
                origin={origin}
                destination={selected}
                route={routeResult}
                error={routeError ? routeErrorMessage(routeError) : null}
                accessible={accessible}
                origins={originChoices}
                onChangeOrigin={handleChangeOrigin}
                warning={originWarning}
                onToggleAccessible={() => setAccessible((a) => !a)}
                onClose={closePanel}
                onUseMyLocation={requestGeolocation}
                onStart={() => setNavigationActive(true)}
                onRecenter={handleLocateClick}
                onChangeDestination={() => {
                  setPanelMode('search');
                  setSelected(null);
                  setNavigationActive(false);
                }}
              />
            )}

            {panelMode === 'route' && selected && !origin && (
              <div className="animate-fade-up">
                <PanelSectionHeader title={`Itinéraire vers ${selected.name}`} onClose={closePanel} />
                {geoStatus === 'locating' && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    <span>
                      Recherche de votre position…
                      <span className="mt-0.5 block text-xs font-normal text-slate-400">
                        Votre position est utilisée pour vous localiser sur le campus et vous guider vers une destination.
                      </span>
                    </span>
                  </div>
                )}
                {(geoStatus === 'denied' || geoStatus === 'unavailable') && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    <p>{geoMessage ?? "Votre position n'est pas disponible."}</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3"
                      icon={<Crosshair className="h-4 w-4" />}
                      onClick={() => setManualPickMode(true)}
                    >
                      Choisir le départ sur la carte
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </aside>
      )}

      {/* Onglet de réouverture (desktop) : visible uniquement quand le
          panneau gauche a été masqué. Ne recouvre qu'un minimum de carte. */}
      {!desktopPanelOpen && (
        <button
          onClick={() => setDesktopPanelOpen(true)}
          aria-label="Afficher le panneau du campus"
          title="Afficher le panneau"
          className="absolute left-4 top-4 z-20 hidden items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/95 py-2.5 pl-3 pr-3.5 text-xs font-semibold text-hec-950 shadow-panel backdrop-blur-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500 lg:flex"
        >
          <ChevronRight className="h-4 w-4" />
          <Compass className="h-4 w-4" />
        </button>
      )}

      {/* ————————————————————— Contrôles carte — desktop (≥1024px) ————————————————————— */}

      {/* Sélecteur de styles */}
      <div className="absolute right-4 top-4 z-20 hidden lg:block">
        <div className="flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/95 p-1 shadow-glass backdrop-blur-sm">
          {MAP_STYLE_MODES.map((mode) => {
            const Icon = styleModeIcons[mode];
            const active = styleMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setStyleMode(mode)}
                title={mapStyleLabels[mode]}
                aria-label={mapStyleLabels[mode]}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500 ${
                  active ? 'bg-hec-950 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{mapStyleLabels[mode]}</span>
              </button>
            );
          })}
        </div>
        {usingFallbackProvider && (
          <div className="mt-2 rounded-full bg-amber-100 px-3 py-1 text-center text-[10px] font-semibold text-amber-700 shadow-glass">
            Fournisseur de secours actif
          </div>
        )}
      </div>

      {/* Bouton "Ma position" + précision GPS, en pile verticale à droite */}
      <div className="absolute right-4 top-16 z-20 hidden flex-col items-end gap-2 lg:flex">
        <button
          onClick={handleLocateClick}
          disabled={geoStatus === 'locating'}
          aria-label={geoStatus === 'granted' ? 'Actualiser ma position' : geoStatusShortLabel[geoStatus]}
          title={geoStatus === 'granted' ? 'Actualiser ma position' : geoStatusShortLabel[geoStatus]}
          className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-glass transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500 disabled:cursor-not-allowed ${
            geoStatus === 'granted'
              ? 'border-hec-200 bg-hec-950 text-white'
              : geoStatus === 'denied' || geoStatus === 'unavailable'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-slate-200/70 bg-white/95 text-hec-950 hover:bg-slate-50'
          }`}
        >
          {geoStatus === 'locating' ? (
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Crosshair className="h-5 w-5" />
          )}
        </button>

        {geoFix && geoStatus === 'granted' && (
          <div className="flex items-center gap-1.5 rounded-full border border-white/60 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-glass">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            {accuracyTierLabels[geoFix.tier]} · {formatAccuracy(geoFix.accuracy)}
          </div>
        )}

        {(geoStatus === 'denied' || geoStatus === 'unavailable') && (
          <div className="max-w-[220px] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-right text-[11px] font-medium text-amber-700 shadow-glass">
            {geoMessage ?? "Position indisponible."}
          </div>
        )}
      </div>

      {/* Panneau de diagnostic GPS — outil de développement uniquement,
          jamais construit/affiché en production (import.meta.env.DEV est
          statiquement remplacé par `false` au build prod par Vite). */}
      {import.meta.env.DEV && (
        <GeoDiagnosticPanel status={geoStatus} fix={geoFix} message={geoMessage} permission={geoPermission} />
      )}

      {/* ————————————————————— Contrôles carte — mobile & tablette (<1024px) ————————————————————— */}
      {/* Empilement minimal au-dessus de la carte : uniquement la recherche
          + un bouton "Filtres" au repos, pour rendre à la carte le maximum
          d'espace vertical (PHASE 2 UX, priorité "MAP FIRST"). Le style de
          carte et les catégories POI restent entièrement fonctionnels,
          simplement repliés derrière ce bouton au lieu d'occuper en
          permanence deux bandeaux au-dessus de la carte. */}
      <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex flex-col gap-2 lg:hidden">
        <div className="flex items-center gap-2 md:mx-auto md:w-full md:max-w-md">
          <button
            onClick={() => setMobileSearchOpen(true)}
            className="flex min-h-[48px] flex-1 items-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-4 shadow-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
          >
            <SearchIcon className="h-5 w-5 shrink-0 text-hec-500" />
            <span className="min-w-0 flex-1 truncate text-left text-sm text-slate-400">
              Rechercher une salle, un bureau…
            </span>
          </button>
          <button
            onClick={() => setMobileMapControlsOpen((o) => !o)}
            aria-expanded={mobileMapControlsOpen}
            aria-label="Filtres et style de carte"
            className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border shadow-glass transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500 ${
              mobileMapControlsOpen
                ? 'border-hec-950 bg-hec-950 text-white'
                : 'border-slate-200/70 bg-white text-hec-950'
            }`}
          >
            <SlidersHorizontal className="h-5 w-5" />
            {!mobileMapControlsOpen && (styleMode !== 'plan' || poiFilter !== 'all') && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-hec-500" />
            )}
          </button>
        </div>

        {/* Bandeau campus compact/repliable (mobile & tablette uniquement) :
            affiche nom + statut sur une seule ligne, avec bouton pour
            développer le détail complet (tagline). Ne recouvre jamais la
            carte que sur cette hauteur minimale, et se referme au second
            tap — même logique de progressive disclosure que le bouton
            "Filtres" ci-dessus. */}
        <div className="md:mx-auto md:w-full md:max-w-md">
          <button
            onClick={() => setMobileCampusOpen((o) => !o)}
            aria-expanded={mobileCampusOpen}
            aria-label={
              mobileCampusOpen
                ? 'Réduire les informations du campus'
                : 'Développer les informations du campus'
            }
            className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/95 px-3.5 py-2 shadow-glass backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-hec-950">
              {campus.name}
            </span>
            <span className="shrink-0 text-[10px] font-medium text-emerald-700">Actif</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
                mobileCampusOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {mobileCampusOpen && (
            <div className="mt-1.5 animate-fade-up rounded-2xl border border-slate-200/70 bg-white/95 px-3.5 py-3 shadow-glass backdrop-blur-sm">
              <p className="text-xs text-slate-500">{campus.tagline}</p>
            </div>
          )}
        </div>

        {mobileMapControlsOpen && (
          <div className="animate-fade-up space-y-2 md:mx-auto md:w-full md:max-w-md">
            <div
              className="flex gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/95 p-1.5 shadow-glass backdrop-blur-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Style de carte"
            >
              {MAP_STYLE_MODES.map((mode) => {
                const Icon = styleModeIcons[mode];
                const active = styleMode === mode;
                return (
                  <button
                    key={mode}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStyleMode(mode)}
                    aria-label={mapStyleLabels[mode]}
                    className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500 ${
                      active ? 'bg-hec-950 text-white' : 'text-slate-500'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{mapStyleLabels[mode]}</span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-1.5 shadow-glass backdrop-blur-sm [&_[role=listbox]]:overflow-x-auto [&_[role=listbox]]:[-ms-overflow-style:none] [&_[role=listbox]]:[scrollbar-width:none] [&_[role=listbox]::-webkit-scrollbar]:hidden">
              <POIFilters active={poiFilter} onChange={setPoiFilter} />
            </div>
          </div>
        )}

        {usingFallbackProvider && (
          <div className="self-start rounded-full bg-amber-100 px-3 py-1 text-[10px] font-semibold text-amber-700 shadow-glass">
            Fournisseur de secours actif
          </div>
        )}
      </div>

      {/* Statut GPS compact mobile/tablette : n'apparaît que s'il y a
          vraiment quelque chose à dire, et jamais quand le panneau
          "itinéraire" affiche déjà le même message. */}
      {geoStatus !== 'idle' && panelMode !== 'route' && (
        <div className="pointer-events-none absolute inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 flex justify-center lg:hidden">
          {geoStatus === 'locating' && (
            <div className="pointer-events-auto flex max-w-[280px] items-start gap-1.5 rounded-2xl border border-white/60 bg-white/95 px-3 py-2 text-[11px] font-medium text-slate-500 shadow-glass">
              <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none" />
              <span>
                Recherche de votre position…
                <span className="mt-0.5 block font-normal text-slate-400">
                  Votre position est utilisée pour vous localiser sur le campus et vous guider vers une destination.
                </span>
              </span>
            </div>
          )}
          {geoStatus === 'granted' && geoFix && (
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/60 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-glass">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              {accuracyTierLabels[geoFix.tier]} · {formatAccuracy(geoFix.accuracy)}
            </div>
          )}
          {(geoStatus === 'denied' || geoStatus === 'unavailable') && (
            <div className="pointer-events-auto max-w-[280px] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-medium text-amber-700 shadow-glass">
              {geoMessage ?? 'Position indisponible.'}
            </div>
          )}
        </div>
      )}

      {/* État de chargement / erreur des POI publics — discret, jamais bloquant
          (ÉTAPE 18 : jamais silencieux, jamais de faux lieu affiché à la place) */}
      {showExternalPois && (poiLoading || poiError) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-20 flex justify-center lg:bottom-6 lg:left-[416px] lg:right-auto lg:justify-start lg:pl-2">
          <div className="pointer-events-auto">
            {poiLoading && (
              <div className="flex items-center gap-1.5 rounded-full border border-white/60 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-glass">
                <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                Recherche des lieux à proximité…
              </div>
            )}
            {!poiLoading && poiError && (
              <button
                onClick={loadPoisForCurrentView}
                className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700 shadow-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <AlertTriangle className="h-3 w-3" />
                {poiError} · Réessayer
              </button>
            )}
          </div>
        </div>
      )}

      {/* Carte indisponible */}
      {mapError && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-white/90 backdrop-blur-sm">
          <EmptyState
            icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
            title={mapError}
            description="Vérifiez la configuration de la carte (variables VITE_MAP_*) ou votre connexion internet, puis réessayez."
          />
          <Button
            className="mt-4"
            onClick={() => {
              setMapError(null);
              setMapKey((k) => k + 1);
            }}
          >
            Réessayer
          </Button>
        </div>
      )}

      {/* Mode "position manuelle" actif */}
      {manualPickMode && (
        <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full bg-hec-950 px-4 py-2.5 text-sm font-medium text-white shadow-panel">
            <Crosshair className="h-4 w-4" />
            Cliquez sur la carte pour indiquer votre point de départ
            <button
              onClick={() => setManualPickMode(false)}
              className="ml-1 rounded-full p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Annuler"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ————————————————————— Mobile & tablette ————————————————————— */}

      {/* Feuille de recherche plein écran (mobile & tablette) */}
      {mobileSearchOpen && (
        <div className="absolute inset-0 z-40 flex flex-col bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] lg:hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-hec-500" />
              <span className="font-display font-bold text-hec-950">Explorer le campus</span>
            </div>
            <button
              onClick={() => setMobileSearchOpen(false)}
              className="grid h-11 w-11 place-items-center rounded-full text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
              aria-label="Fermer la recherche"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="border-b border-slate-100 px-4 py-3">
            <POIFilters active={poiFilter} onChange={setPoiFilter} />
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <LocationSearch locations={locations} recent={recent} onSelect={openLocation} autoFocus />
            {recentError && <p className="mt-2 text-[11px] text-slate-400">{recentError}</p>}
          </div>
        </div>
      )}

      {/* Bottom sheet mobile & tablette : détail / itinéraire / POI */}
      {panelMode !== 'search' && (selected || selectedPoi) && (
        <div className="absolute inset-x-0 bottom-0 z-30 animate-slide-up rounded-t-3xl bg-white shadow-panel motion-reduce:animate-none lg:hidden">
          <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-slate-200" />
          <div className="max-h-[72vh] overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 md:mx-auto md:max-w-xl">
            {panelMode === 'poi' && selectedPoi && (
              <ExternalPOIDetail
                poi={selectedPoi}
                userLng={geoFix?.lng}
                userLat={geoFix?.lat}
                onClose={closePanel}
              />
            )}

            {panelMode === 'detail' && selected && (
              <LocationDetail
                location={selected}
                isFavorite={favorites.has(selected.id)}
                canFavorite={Boolean(session)}
                onToggleFavorite={() => toggleFavorite(selected.id)}
                onNavigate={() => startRoute(selected)}
                onClose={closePanel}
              />
            )}

            {panelMode === 'route' && selected && origin && !routeResult && !routeError && routingLoading && (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500" role="status">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                Chargement du réseau piéton…
              </div>
            )}

            {panelMode === 'route' && selected && origin && (routeResult || routeError) && (
              <RoutePanel
                origin={origin}
                destination={selected}
                route={routeResult}
                error={routeError ? routeErrorMessage(routeError) : null}
                accessible={accessible}
                origins={originChoices}
                onChangeOrigin={handleChangeOrigin}
                warning={originWarning}
                onToggleAccessible={() => setAccessible((a) => !a)}
                onClose={closePanel}
                onUseMyLocation={requestGeolocation}
                onStart={() => setNavigationActive(true)}
                onRecenter={handleLocateClick}
                onChangeDestination={() => {
                  setPanelMode('search');
                  setSelected(null);
                  setNavigationActive(false);
                }}
              />
            )}

            {panelMode === 'route' && !origin && (
              <div className="animate-fade-up">
                <PanelSectionHeader title={`Itinéraire vers ${selected?.name ?? ''}`} onClose={closePanel} />
                {geoStatus === 'locating' && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    <span>
                      Recherche de votre position…
                      <span className="mt-0.5 block text-xs font-normal text-slate-400">
                        Votre position est utilisée pour vous localiser sur le campus et vous guider vers une destination.
                      </span>
                    </span>
                  </div>
                )}
                {(geoStatus === 'denied' || geoStatus === 'unavailable') && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    <p>{geoMessage ?? "Votre position n'est pas disponible."}</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3"
                      icon={<Crosshair className="h-4 w-4" />}
                      onClick={() => {
                        setMobileSearchOpen(false);
                        setManualPickMode(true);
                      }}
                    >
                      Choisir le départ sur la carte
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Légende */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 lg:block">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-slate-200/70 bg-white/95 px-4 py-2 text-xs text-slate-600 shadow-glass backdrop-blur-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-hec-500" />
            {buildingCategoryLabels.academic}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Vous êtes ici
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            Destination
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-hec-950" />
            Points d'intérêt HEC
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
            Lieux publics (OSM)
          </span>
        </div>
      </div>

      {/* CTA flottant "Me guider" (desktop, quand un lieu est sélectionné) */}
      {panelMode === 'detail' && selected && (
        <div className="absolute bottom-6 right-6 z-10 hidden lg:block">
          <Button
            size="lg"
            icon={<Navigation className="h-5 w-5" />}
            onClick={() => startRoute(selected)}
            className="shadow-panel"
          >
            Me guider
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * En-tête de section réutilisé dans les états "itinéraire" du panneau
 * (desktop et bottom sheet mobile) : titre + bouton de fermeture cohérents.
 * Purement présentationnel — ne touche à aucune logique.
 */
function PanelSectionHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <span className="truncate font-display font-bold text-hec-950">{title}</span>
      <button
        onClick={onClose}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hec-500"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}