import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MLMap } from 'maplibre-gl';
import type { Building, Campus, CampusLocation } from '@/lib/types';
import type { ExternalPOI } from '@/lib/poi-categories';
import { toGeoFix, type GeoFix } from '@/lib/geolocation';
import { haversine } from '@/lib/nav';
import { toLngLat } from '@/lib/geo-validation';
import { getMapStyle, mapStyleLabels, type MapStyleMode } from '@/lib/map-config';
import { loadPoiIcons, poiIconId, attachMissingIconFallback } from '@/lib/poi-icon-sprites';

type RouteFeature = {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: Record<string, never>;
};
type RouteFeatureCollection = { type: 'FeatureCollection'; features: [] };
type ExternalPoiFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: { id: string; name: string; category: string; icon: string };
  }>;
};

const ROUTE_ARROW_IMAGE_ID = 'route-arrow';
const ROUTE_LINE_COLOR = '#1e5eff';

interface CampusMapProps {
  campus: Campus;
  buildings: Building[];
  poiLocations: CampusLocation[];
  externalPois: ExternalPOI[];
  focusLocation: CampusLocation | null;
  originLocation: CampusLocation | null;
  routeCoordinates: [number, number][] | null;
  styleMode: MapStyleMode;
  manualPickMode: boolean;
  onSelectBuilding: (building: Building) => void;
  onSelectLocation: (location: CampusLocation) => void;
  onSelectExternalPOI: (poi: ExternalPOI) => void;
  onManualPick: (lngLat: [number, number]) => void;
  onGeolocate: (fix: GeoFix) => void;
  onGeolocateError: (message: string, code?: number) => void;
  onMapError: (message: string) => void;
  onMapReady?: (map: MLMap) => void;
  onFallbackProvider?: (usingFallback: boolean) => void;
  /** Expose le déclenchement du recentrage GPS natif (bouton "Ma position" de MapPage). */
  onGeolocateControlReady?: (trigger: () => void) => void;
}

function buildingMarkerEl(building: Building, onClick: () => void) {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', `${building.name} (${building.code})`);
  el.className =
    'group flex items-center gap-1.5 rounded-full bg-white pl-1 pr-2.5 py-1 shadow-[0_6px_20px_rgba(17,29,71,0.18)] border border-white ring-1 ring-black/5 transition-transform hover:scale-105';
  el.innerHTML = `
    <span class="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-white" style="background:${building.color}">${building.code}</span>
    <span class="text-[11px] font-semibold text-hec-950 whitespace-nowrap max-w-[120px] truncate">${building.name.split('—')[0].trim()}</span>
  `;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

// Icône pin générique (bureau, service, salle exposée en extérieur…).
const PIN_ICON_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>';

// Icône "porte" dédiée aux entrées réelles de bâtiment (kind === 'entrance'),
// pour les distinguer visuellement des autres POI HEC (ÉTAPE 7) tout en
// conservant le même code couleur que la légende ("Points d'intérêt HEC").
const DOOR_ICON_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M6 21V5a2 2 0 0 1 2-2h6l4 3v15"/><circle cx="15" cy="12" r="1"/></svg>';

/**
 * Construit un marqueur "pin" HEC générique. Facteur commun entre les POI
 * ordinaires et les entrées de bâtiment pour éviter la duplication de markup
 * (ÉTAPE 19 : garder le fichier maintenable).
 */
function buildPoiPinEl(icon: string, title: string, ariaLabel: string, onClick: () => void) {
  const el = document.createElement('button');
  el.type = 'button';
  // 36px : cible tactile conforme aux recommandations d'accessibilité
  // mobile (ÉTAPE 18), au lieu des 28px précédents.
  el.className =
    'grid h-9 w-9 place-items-center rounded-full bg-hec-950 text-white shadow-[0_6px_18px_rgba(17,29,71,0.3)] ring-2 ring-white transition-transform hover:scale-110';
  el.innerHTML = icon;
  el.title = title;
  el.setAttribute('aria-label', ariaLabel);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

function poiMarkerEl(loc: CampusLocation, onClick: () => void) {
  return buildPoiPinEl(PIN_ICON_SVG, loc.name, loc.name, onClick);
}

function entranceMarkerEl(loc: CampusLocation, onClick: () => void) {
  return buildPoiPinEl(DOOR_ICON_SVG, loc.name, `Entrée : ${loc.name}`, onClick);
}

function focusMarkerEl() {
  // Point rouge = destination
  const el = document.createElement('div');
  el.className = 'relative';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Destination');
  el.innerHTML = `
    <span class="absolute -inset-3 rounded-full bg-red-500/25 animate-ping"></span>
    <span class="relative grid h-9 w-9 place-items-center rounded-full bg-red-500 text-white shadow-[0_8px_24px_rgba(239,68,68,0.5)] ring-4 ring-white">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
    </span>`;
  return el;
}

function originMarkerEl(label: string) {
  // Point vert = "Vous êtes ici" / départ
  const el = document.createElement('div');
  el.className = 'relative';
  el.title = label;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  el.innerHTML = `
    <span class="absolute -inset-2.5 rounded-full bg-emerald-500/25 animate-ping"></span>
    <span class="relative grid h-6 w-6 place-items-center rounded-full bg-emerald-500 ring-4 ring-white shadow-[0_6px_18px_rgba(16,185,129,0.5)]"></span>`;
  return el;
}

/**
 * Génère une petite flèche pleine (triangle) en mémoire, sans dépendance
 * externe, pour indiquer le sens de progression le long de l'itinéraire
 * (ÉTAPE 11, "éventuellement flèches/direction"). Renvoie null si le canvas
 * 2D n'est pas disponible (environnement dégradé) : l'absence de flèches ne
 * doit jamais empêcher l'affichage de la route elle-même.
 */
function createRouteArrowImageData(): ImageData | null {
  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);
  // Flèche blanche : une flèche de la couleur de la ligne serait
  // invisible dessus.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(size / 2, 2);
  ctx.lineTo(size - 4, size - 6);
  ctx.lineTo(size / 2, size - 10);
  ctx.lineTo(4, size - 6);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

/** Filtre les points d'un tracé : jamais de NaN / null / hors bornes
 * envoyés à MapLibre (un seul point invalide ferait échouer setData). */
function sanitizeRoute(coords: [number, number][] | null | undefined): [number, number][] | null {
  if (!coords) return null;
  const clean = coords.filter(
    (c) => Array.isArray(c) && toLngLat(c[0], c[1]) !== null && !(c[0] === 0 && c[1] === 0),
  );
  return clean.length > 1 ? clean : null;
}

function routeFeature(coords: [number, number][] | null): RouteFeature | RouteFeatureCollection {
  if (!coords) return { type: 'FeatureCollection', features: [] };
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} };
}

/** Marges de cadrage sûres : la carte n'est jamais "cadrée" derrière le
 * panneau latéral (desktop) ni derrière la bottom sheet (mobile), et les
 * marges ne dépassent jamais la taille réelle du canvas (sinon MapLibre
 * refuse de cadrer). */
function routeFitPadding(map: MLMap): maplibregl.PaddingOptions {
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  const desktop = w >= 1024;
  const padding = desktop
    ? { top: 80, bottom: 80, left: 420, right: 80 }
    : { top: 110, bottom: Math.round(h * 0.42), left: 40, right: 40 };
  const maxH = Math.max(0, h - 80);
  const maxW = Math.max(0, w - 80);
  if (padding.top + padding.bottom > maxH) {
    const k = maxH / (padding.top + padding.bottom);
    padding.top = Math.floor(padding.top * k);
    padding.bottom = Math.floor(padding.bottom * k);
  }
  if (padding.left + padding.right > maxW) {
    const k = maxW / (padding.left + padding.right);
    padding.left = Math.floor(padding.left * k);
    padding.right = Math.floor(padding.right * k);
  }
  return padding;
}

// Nouveau cadrage automatique seulement si la destination change ou si le
// départ s'est déplacé de plus que ce seuil (le bruit GPS d'un utilisateur
// immobile ne doit jamais faire "sauter" la caméra).
const ROUTE_REFIT_ORIGIN_MOVE_M = 40;

export function CampusMap({
  campus,
  buildings,
  poiLocations,
  externalPois,
  focusLocation,
  originLocation,
  routeCoordinates,
  styleMode,
  manualPickMode,
  onSelectBuilding,
  onSelectLocation,
  onSelectExternalPOI,
  onManualPick,
  onGeolocate,
  onGeolocateError,
  onMapError,
  onMapReady,
  onFallbackProvider,
  onGeolocateControlReady,
}: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const dynamicRef = useRef<maplibregl.Marker[]>([]);
  const readyRef = useRef(false);
  const poiInteractionsAttachedRef = useRef(false);
  const lastRouteData = useRef<RouteFeature | null>(null);
  // Dernier tracé reçu en props, lisible depuis les handlers de carte
  // ('load', 'style.load') même si l'effet de rendu de la route n'a pas
  // encore pu s'exécuter (ex. lien direct ?nav= : la route est calculée
  // avant que la carte soit prête).
  const routeCoordsRef = useRef<[number, number][] | null>(null);
  routeCoordsRef.current = sanitizeRoute(routeCoordinates);
  const fitStateRef = useRef<{ origin: [number, number]; dest: [number, number] } | null>(null);
  const geolocateTrackingRef = useRef(false);
  const lastGeolocatePosRef = useRef<[number, number] | null>(null);
  const lastExternalPoiData = useRef<ExternalPoiFeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const externalPoisRef = useRef<ExternalPOI[]>(externalPois);
  externalPoisRef.current = externalPois;
  // Suivi, par mode de style, du fait qu'on a deja bascule sur le fournisseur
  // de secours (evite une boucle infinie si le fallback echoue aussi).
  const fallbackTriedRef = useRef<Partial<Record<MapStyleMode, boolean>>>({});
  const usingFallbackRef = useRef(false);
  const styleModeRef = useRef(styleMode);
  styleModeRef.current = styleMode;
  // Un serveur de tuiles gratuit (Esri, CARTO...) peut manquer une requête
  // isolée (timeout ponctuel) sans être réellement indisponible — c'est
  // normal et ne doit jamais bloquer toute la carte. On ne considère le
  // fournisseur comme en panne qu'après plusieurs échecs consécutifs SANS
  // qu'aucune tuile n'ait chargé entre-temps (voir 'error' et 'sourcedata'
  // ci-dessous).
  const tileErrorStreakRef = useRef(0);
  const TILE_ERROR_THRESHOLD = 4;

  // Keep latest callback props reachable from map event listeners without
  // re-creating the map instance every render.
  const callbacksRef = useRef({
    onSelectBuilding,
    onSelectLocation,
    onSelectExternalPOI,
    onManualPick,
    onGeolocate,
    onGeolocateError,
    onMapError,
    onFallbackProvider,
    onGeolocateControlReady,
  });
  callbacksRef.current = {
    onSelectBuilding,
    onSelectLocation,
    onSelectExternalPOI,
    onManualPick,
    onGeolocate,
    onGeolocateError,
    onMapError,
    onFallbackProvider,
    onGeolocateControlReady,
  };

  function addRouteLayers(map: MLMap) {
    const initial = routeFeature(routeCoordsRef.current);
    lastRouteData.current = routeCoordsRef.current ? (initial as RouteFeature) : null;
    if (!map.getSource('route')) {
      map.addSource('route', { type: 'geojson', data: initial as never });
    } else {
      (map.getSource('route') as maplibregl.GeoJSONSource).setData(initial as never);
    }
    // Épaisseur qui grandit avec le zoom : très lisible de loin comme de
    // près, sur mobile comme sur desktop. Ligne CONTINUE (l'ancien
    // line-dasharray [0.01, 1.6] produisait de simples points espacés,
    // quasi invisibles sur satellite / hybride / sombre).
    if (!map.getLayer('route-casing')) {
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 8, 17, 12, 20, 18],
          'line-opacity': 1,
        },
      });
    }
    if (!map.getLayer('route-line')) {
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROUTE_LINE_COLOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 4.5, 17, 7, 20, 11],
          'line-opacity': 1,
        },
      });
    }
    // Flèches de direction le long du tracé. Purement cosmétique : si la
    // génération d'image échoue, on continue sans flèches plutôt que de
    // casser l'affichage de la route.
    if (!map.hasImage(ROUTE_ARROW_IMAGE_ID)) {
      const arrow = createRouteArrowImageData();
      if (arrow) map.addImage(ROUTE_ARROW_IMAGE_ID, arrow);
    }
    if (!map.getLayer('route-arrows') && map.hasImage(ROUTE_ARROW_IMAGE_ID)) {
      map.addLayer({
        id: 'route-arrows',
        type: 'symbol',
        source: 'route',
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 90,
          'icon-image': ROUTE_ARROW_IMAGE_ID,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.4, 20, 0.7],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }
  }

  function toExternalPoiCollection(pois: ExternalPOI[]): ExternalPoiFeatureCollection {
    const features: ExternalPoiFeatureCollection['features'] = [];
    for (const poi of pois) {
      const pos = toLngLat(poi.lng, poi.lat);
      if (!pos) continue; // garde-fou anti-crash (ÉTAPE 7-8 / 24)
      features.push({
        type: 'Feature',
        id: poi.id,
        geometry: { type: 'Point', coordinates: pos },
        properties: {
          id: poi.id,
          name: poi.name,
          category: poi.category,
          icon: poiIconId(poi.category),
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  // Couche POI externes (ÉTAPES 5-6 du cahier des charges POI) : source
  // GeoJSON avec clustering natif MapLibre — beaucoup plus performant que
  // des centaines de marqueurs DOM individuels quand la carte est
  // dézoomée. Ajoutée comme couche indépendante au-dessus du fond
  // cartographique (ÉTAPE 15), donc visible en satellite comme en plan.
  //
  // IMPORTANT : cette fonction ne fait QUE (re)créer la source et les
  // layers — appelée à chaque 'load' ET 'style.load' car setStyle() les
  // détruit. Les *interactions* (click/hover) sont attachées séparément,
  // une seule fois, par attachPoiInteractions() : les event listeners posés
  // via map.on() vivent sur l'instance `map` et ne sont PAS supprimés par
  // setStyle(), donc les réattacher ici les aurait dupliqués à chaque
  // changement de style (bug corrigé).
  function addPoiLayers(map: MLMap) {
    if (!map.getSource('external-pois')) {
      map.addSource('external-pois', {
        type: 'geojson',
        data: lastExternalPoiData.current,
        cluster: true,
        clusterRadius: 48,
        clusterMaxZoom: 15,
      });
    }
    if (!map.getLayer('poi-clusters')) {
      map.addLayer({
        id: 'poi-clusters',
        type: 'circle',
        source: 'external-pois',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#64748b',
            10,
            '#475569',
            30,
            '#1e293b',
          ],
          'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 30, 23],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
    }
    if (!map.getLayer('poi-cluster-count')) {
      map.addLayer({
        id: 'poi-cluster-count',
        type: 'symbol',
        source: 'external-pois',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });
    }
    if (!map.getLayer('poi-unclustered')) {
      map.addLayer({
        id: 'poi-unclustered',
        type: 'symbol',
        source: 'external-pois',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': 0.44,
          'icon-allow-overlap': true,
          'icon-anchor': 'center',
        },
      });
    }
  }

  // Attache les interactions (click/hover) sur les layers POI. Appelée une
  // seule fois par instance de carte (voir le 'load' handler) : les layers
  // eux-mêmes sont recréés à chaque style.load par addPoiLayers, mais les
  // listeners posés ici restent valides tout du long puisqu'ils vivent sur
  // `map`, pas sur le style.
  function attachPoiInteractions(map: MLMap) {
    if (poiInteractionsAttachedRef.current) return;
    poiInteractionsAttachedRef.current = true;

    const onClusterClick = (e: maplibregl.MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const clusterId = feature.properties?.cluster_id;
      const source = map.getSource('external-pois') as maplibregl.GeoJSONSource;
      source
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          const geom = feature.geometry as { type: 'Point'; coordinates: [number, number] };
          map.easeTo({ center: geom.coordinates, zoom: zoom ?? map.getZoom() + 1 });
        })
        .catch(() => {});
    };
    const onPoiClick = (e: maplibregl.MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      const id = feature?.properties?.id as string | undefined;
      if (!id) return;
      const poi = externalPoisRef.current.find((p) => p.id === id);
      if (poi) callbacksRef.current.onSelectExternalPOI(poi);
    };
    map.on('click', 'poi-clusters', onClusterClick);
    map.on('click', 'poi-unclustered', onPoiClick);
    map.on('mouseenter', 'poi-clusters', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'poi-clusters', () => (map.getCanvas().style.cursor = ''));
    map.on('mouseenter', 'poi-unclustered', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'poi-unclustered', () => (map.getCanvas().style.cursor = ''));
  }

  function addAllMarkers(map: MLMap) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    buildings.forEach((b) => {
      // Garde-fou anti-crash (ÉTAPE 7-8) : une seule coordonnée invalide ne
      // doit jamais faire planter toute la carte — on l'ignore et on continue.
      const pos = toLngLat(b.center_lng, b.center_lat);
      if (!pos) return;
      const marker = new maplibregl.Marker({
        element: buildingMarkerEl(b, () => callbacksRef.current.onSelectBuilding(b)),
      })
        .setLngLat(pos)
        .addTo(map);
      markersRef.current.push(marker);
    });
    poiLocations.forEach((loc) => {
      // Garde-fou de hiérarchie (ÉTAPE 8) : une room/bureau intérieur ne
      // doit jamais apparaître comme point extérieur, même si un appelant
      // amont oublie de filtrer — on l'ignore ici en dernier recours.
      if (loc.kind === 'room') return;
      const pos = toLngLat(loc.lng, loc.lat);
      if (!pos) return;
      const marker = new maplibregl.Marker({
        element:
          loc.kind === 'entrance'
            ? entranceMarkerEl(loc, () => callbacksRef.current.onSelectLocation(loc))
            : poiMarkerEl(loc, () => callbacksRef.current.onSelectLocation(loc)),
      })
        .setLngLat(pos)
        .addTo(map);
      markersRef.current.push(marker);
    });
  }

  // Map creation (once par campus)
  useEffect(() => {
    if (!containerRef.current) return;
    // Garde-fou : MapPage vérifie déjà que campus.center_lng/center_lat sont
    // valides avant de monter ce composant (voir l'état "Position du campus
    // non configurée"), donc toLngLat ne devrait jamais renvoyer null ici.
    // On ne retombe plus jamais sur (0,0) — une régression amont doit être
    // visible (log clair + remontée au parent) plutôt que silencieusement
    // masquée par une fausse position ou un écran vide.
    const center = toLngLat(campus.center_lng, campus.center_lat);
    if (!center) {
      console.error(
        '[CampusMap] Centre de campus invalide reçu alors que MapPage devrait le filtrer :',
        { center_lng: campus.center_lng, center_lat: campus.center_lat },
      );
      callbacksRef.current.onMapError(
        'Position du campus invalide reçue depuis les données. Contactez un administrateur.',
      );
      return;
    }
    // Résolution du style AVANT de construire la carte : si aucun
    // fournisseur n'est configuré (MapConfigError, ex. VITE_MAP_PROVIDER
    // absent), on ne doit jamais laisser l'exception remonter non gérée
    // jusqu'à l'ErrorBoundary générique (qui affiche à tort un message de
    // connexion internet). On la traite comme n'importe quelle autre panne
    // de carte réelle : via le canal onMapError existant, avec le message
    // exact déjà produit par map-config.ts (aucune donnée inventée).
    let initialStyle: ReturnType<typeof getMapStyle>;
    try {
      initialStyle = getMapStyle(styleMode);
    } catch (err) {
      console.error('[CampusMap] Impossible de résoudre le style de carte :', err);
      callbacksRef.current.onMapError(
        err instanceof Error ? err.message : 'Configuration de la carte invalide.',
      );
      return;
    }
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: initialStyle,
      center,
      zoom: campus.default_zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    poiInteractionsAttachedRef.current = false;
    // Écouteur unique par instance de map (survit à setStyle, pas besoin
    // de le rattacher dans 'style.load') : voir attachMissingIconFallback.
    attachMissingIconFallback(map);

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: false }),
      'bottom-right',
    );
    map.addControl(new maplibregl.FullscreenControl(), 'bottom-right');
    const geolocate = new maplibregl.GeolocateControl({
      // Mêmes réglages que startLocationWatch (lib/geolocation.ts) : les
      // deux sources GPS de l'app doivent se comporter de façon identique,
      // jamais l'une "rapide et permissive" et l'autre "lente et stricte".
      positionOptions: { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 },
      trackUserLocation: true,
      showAccuracyCircle: true,
      showUserLocation: true,
      // NB : MapLibre GL (contrairement à Mapbox GL) ne propose pas d'option
      // `showUserHeading` sur GeolocateControl — la flèche de direction du
      // point "Vous êtes ici" est gérée automatiquement par le contrôle
      // quand `trackUserLocation` est actif et que le capteur d'orientation
      // du device répond. Aucune configuration supplémentaire n'est donc
      // nécessaire ni possible ici (RÈGLE ABSOLUE : un seul système GPS).
    });
    map.addControl(geolocate, 'bottom-right');
    // Permet à MapPage de déclencher "Ma position" sans dupliquer la logique
    // GPS : on expose simplement le trigger natif du contrôle existant.
    // Un seul suivi GPS : le contrôle natif ne doit jamais être "re-cliqué"
    // pendant qu'il suit déjà l'utilisateur (un second clic l'éteindrait
    // — cf. états OFF/ACTIVE_LOCK de MapLibre — alors que l'appli croit
    // toujours avoir un GPS actif). Dans ce cas on recentre simplement.
    geolocate.on('trackuserlocationstart', () => {
      geolocateTrackingRef.current = true;
    });
    geolocate.on('trackuserlocationend', () => {
      geolocateTrackingRef.current = false;
    });
    callbacksRef.current.onGeolocateControlReady?.(() => {
      if (geolocateTrackingRef.current && lastGeolocatePosRef.current) {
        map.easeTo({
          center: lastGeolocatePosRef.current,
          zoom: Math.max(map.getZoom(), 18),
          duration: 600,
        });
        return;
      }
      geolocate.trigger();
    });
    geolocate.on('geolocate', (e: GeolocationPosition) => {
      // toGeoFix valide lat/lng/accuracy (aucun NaN/null) et ne fabrique
      // jamais heading/speed : `null` si le capteur ne les fournit pas.
      const fix = toGeoFix(e);
      if (!fix) return;
      lastGeolocatePosRef.current = [fix.lng, fix.lat];
      callbacksRef.current.onGeolocate(fix);
    });
    geolocate.on('error', (e: GeolocationPositionError) => {
      const message =
        e.code === e.PERMISSION_DENIED
          ? 'Accès à la position refusé. Vous pouvez sélectionner manuellement votre point de départ.'
          : e.code === e.TIMEOUT
            ? 'Position introuvable pour le moment (délai dépassé). Déplacez-vous vers une zone dégagée puis réessayez.'
            : "Votre position n'est pas disponible pour le moment.";
      callbacksRef.current.onGeolocateError(message, e.code);
    });

    // Gestionnaire d'erreur par source (ETAPE 3 du cahier des charges) :
    // - une requête de tuile isolée en échec (timeout ponctuel, normal avec
    //   un fournisseur gratuit) est ignorée tant qu'elle reste isolée — elle
    //   ne doit JAMAIS faire disparaître toute la carte de fond ;
    // - seule une série d'échecs consécutifs, sans qu'aucune tuile n'ait
    //   chargé entre-temps, est traitée comme une vraie panne du fournisseur
    //   -> on tente alors le fournisseur de secours configuré
    //   -> si ça échoue aussi (ou s'il n'y a pas de secours), on affiche une
    //      erreur claire avec [Réessayer], jamais une image inventée.
    // - erreur venant d'une autre source (route, marqueurs) -> ignorée ici,
    //   elle ne doit jamais casser l'affichage de la carte de fond.
    map.on('error', (e) => {
      const sourceId = (e as { sourceId?: string }).sourceId;
      console.error('MapLibre error', sourceId ?? '(carte)', e?.error);

      if (!sourceId || sourceId === 'base' || sourceId === 'reference') {
        tileErrorStreakRef.current += 1;
        if (tileErrorStreakRef.current < TILE_ERROR_THRESHOLD) {
          // Échec isolé (ou encore peu fréquent) : on l'ignore, la carte
          // continue de s'afficher avec les tuiles déjà chargées.
          return;
        }

        const mode = styleModeRef.current;
        if (!fallbackTriedRef.current[mode] && !usingFallbackRef.current) {
          fallbackTriedRef.current[mode] = true;
          usingFallbackRef.current = true;
          tileErrorStreakRef.current = 0;
          callbacksRef.current.onFallbackProvider?.(true);
          map.setStyle(getMapStyle(mode, true));
          return;
        }
        callbacksRef.current.onMapError(
          `${mapStyleLabels[mode]} indisponible : le fournisseur de tuiles ne répond pas.`,
        );
      }
    });

    // Une tuile chargée avec succès prouve que le fournisseur répond bien :
    // on remet le compteur d'échecs à zéro pour ne pas cumuler des échecs
    // isolés espacés dans le temps jusqu'à dépasser le seuil par erreur.
    map.on('sourcedata', (e) => {
      const sourceId = (e as { sourceId?: string }).sourceId;
      if (
        (sourceId === 'base' || sourceId === 'reference') &&
        (e as { isSourceLoaded?: boolean }).isSourceLoaded
      ) {
        tileErrorStreakRef.current = 0;
      }
    });

    map.on('load', () => {
      readyRef.current = true;
      loadPoiIcons(map).then(() => addPoiLayers(map));
      addRouteLayers(map);
      fitRouteIfNeeded(map);
      addAllMarkers(map);
      // Une seule fois par instance de carte (voir la fonction pour le détail).
      attachPoiInteractions(map);
      onMapReady?.(map);
    });

    // Re-attach route/POI sources+layers+images after a full style swap
    // (setStyle removes non-style-owned sources/layers/images). DOM markers
    // are independent of the style and survive automatically. Les
    // interactions POI, elles, ne sont volontairement PAS réattachées ici
    // (voir attachPoiInteractions) pour éviter les listeners dupliqués.
    map.on('style.load', () => {
      if (!readyRef.current) return; // first paint is handled by 'load'
      tileErrorStreakRef.current = 0;
      // La route est reconstruite depuis routeCoordsRef (dernier tracé
      // valide reçu) : un changement de fond de carte ne la fait jamais
      // disparaître.
      addRouteLayers(map);
      loadPoiIcons(map).then(() => addPoiLayers(map));
    });
    // Filet de sécurité : si un swap de style a détruit la source de la
    // route sans passer par 'style.load' (style.load n'est pas toujours
    // émis pour un changement de style "diff"), on la recrée.
    map.on('styledata', () => {
      if (!readyRef.current || !map.isStyleLoaded()) return;
      if (!map.getSource('route') || !map.getLayer('route-line')) {
        try {
          addRouteLayers(map);
        } catch (err) {
          console.error('[CampusMap] Restauration de la route impossible :', err);
        }
      }
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      dynamicRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      dynamicRef.current = [];
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
      poiInteractionsAttachedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus.id]);

  // Rebuild static markers when the underlying lists change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    addAllMarkers(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings, poiLocations]);

  // Mise à jour de la couche POI externes (OSM) quand la liste change —
  // ex. après un déplacement de la carte (voir MapPage, fetch debouncé).
  useEffect(() => {
    const collection = toExternalPoiCollection(externalPois);
    lastExternalPoiData.current = collection;
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource('external-pois') as maplibregl.GeoJSONSource | undefined;
    source?.setData(collection);
  }, [externalPois]);

  // Changement de mode (Plan/Satellite/Hybride/Topo/Sombre), en conservant
  // centre/zoom/cap/marqueurs/route. Un changement de mode redonne sa chance
  // au fournisseur primaire (l'utilisateur peut revenir en arrière puis
  // ressayer un mode qui avait échoué).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    usingFallbackRef.current = false;
    tileErrorStreakRef.current = 0;
    callbacksRef.current.onFallbackProvider?.(false);
    try {
      map.setStyle(getMapStyle(styleMode));
    } catch (err) {
      console.error('[CampusMap] Impossible de changer de style de carte :', err);
      callbacksRef.current.onMapError(
        err instanceof Error ? err.message : 'Configuration de la carte invalide.',
      );
    }
  }, [styleMode]);
  // Note : le bouton [Réessayer] de MapPage remonte la carte via `key`,
  // ce qui repart naturellement sur le fournisseur primaire.

  // Manual position pick: click on the map sets the departure point
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!manualPickMode) {
      map.getCanvas().style.cursor = '';
      return;
    }
    map.getCanvas().style.cursor = 'crosshair';
    const handler = (e: maplibregl.MapMouseEvent) => {
      callbacksRef.current.onManualPick([e.lngLat.lng, e.lngLat.lat]);
    };
    map.on('click', handler);
    return () => {
      map.off('click', handler);
      map.getCanvas().style.cursor = '';
    };
  }, [manualPickMode]);

  // Origin (green) + destination (red) markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    dynamicRef.current.forEach((m) => m.remove());
    dynamicRef.current = [];

    if (originLocation) {
      const pos = toLngLat(originLocation.lng, originLocation.lat);
      if (pos) {
        const m = new maplibregl.Marker({
          element: originMarkerEl(originLocation.name || 'Vous êtes ici'),
        })
          .setLngLat(pos)
          .addTo(map);
        dynamicRef.current.push(m);
      }
    }
    if (focusLocation) {
      const pos = toLngLat(focusLocation.lng, focusLocation.lat);
      if (pos) {
        // En mode sélection manuelle (BuildingPositionPicker), le point
        // rouge est déplaçable au doigt/à la souris pour un ajustement fin
        // et rapide, en plus du clic simple (qui replace le point ailleurs
        // d'un coup). Sur la carte étudiante (mode normal), ce marqueur
        // reste une simple destination, jamais déplaçable.
        const m = new maplibregl.Marker({
          element: focusMarkerEl(),
          draggable: manualPickMode,
        })
          .setLngLat(pos)
          .addTo(map);
        if (manualPickMode) {
          m.on('dragend', () => {
            const { lng, lat } = m.getLngLat();
            callbacksRef.current.onManualPick([lng, lat]);
          });
        }
        dynamicRef.current.push(m);
      }
    }
  }, [focusLocation, originLocation, manualPickMode]);

  // Fly to focus
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusLocation) return;
    const pos = toLngLat(focusLocation.lng, focusLocation.lat);
    if (!pos) return;
    map.flyTo({
      center: pos,
      zoom: Math.max(map.getZoom(), 18),
      duration: 900,
      essential: true,
    });
  }, [focusLocation]);

  // Cadre la caméra sur l'itinéraire seulement quand c'est pertinent :
  // nouvelle destination, premier tracé, ou départ réellement déplacé
  // (> ROUTE_REFIT_ORIGIN_MOVE_M). Le bruit GPS d'un utilisateur qui
  // marche ou qui est immobile ne reprend jamais la main sur la carte.
  function fitRouteIfNeeded(map: MLMap) {
    const coords = routeCoordsRef.current;
    if (!coords) {
      fitStateRef.current = null;
      return;
    }
    const origin = coords[0];
    const dest = coords[coords.length - 1];
    const prev = fitStateRef.current;
    const destChanged = !prev || haversine(prev.dest, dest) > 2;
    const originMoved = !prev || haversine(prev.origin, origin) > ROUTE_REFIT_ORIGIN_MOVE_M;
    if (!destChanged && !originMoved) return;
    fitStateRef.current = { origin, dest };
    try {
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coords[0], coords[0]),
      );
      map.fitBounds(bounds, { padding: routeFitPadding(map), duration: 900, maxZoom: 19 });
    } catch (err) {
      console.error('[CampusMap] Cadrage sur la route impossible :', err);
    }
  }

  // Route rendering (persisted across style swaps via routeCoordsRef)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return; // 'load' s'en charge (routeCoordsRef)
    const data = routeFeature(routeCoordsRef.current);
    lastRouteData.current = routeCoordsRef.current ? (data as RouteFeature) : null;
    const src = map.getSource('route') as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data as never);
    else if (map.isStyleLoaded()) addRouteLayers(map);
    fitRouteIfNeeded(map);
  }, [routeCoordinates]);

  return <div ref={containerRef} className="absolute inset-0" />;
}