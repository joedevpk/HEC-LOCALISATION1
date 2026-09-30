import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  addFavorite,
  getAnnouncements,
  getBuildings,
  getCampus,
  getEvents,
  getFavorites,
  getLocations,
  getRouteNodes,
  getRouteSegments,
  filterValidSegments,
  removeFavorite,
} from '@/lib/api';
import type {
  Announcement,
  Building,
  Campus,
  CampusEvent,
  CampusLocation,
  RouteNode,
  RouteSegment,
} from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { logError } from '@/lib/logger';

interface CampusState {
  campus: Campus | null;
  buildings: Building[];
  locations: CampusLocation[];
  events: CampusEvent[];
  announcements: Announcement[];
  routeNodes: RouteNode[];
  routeSegments: RouteSegment[];
  favorites: Set<string>;
  /** Chargement des données CRITIQUES (campus/bâtiments/lieux) : tant que
   * c'est true, MapPage affiche un spinner. */
  loading: boolean;
  /** Erreur CRITIQUE uniquement — casse l'affichage de la carte. */
  error: string | null;
  /** Erreurs SECONDAIRES (événements, annonces, réseau de navigation) :
   * n'empêchent jamais la carte de fonctionner (ÉTAPE 9). */
  eventsError: string | null;
  announcementsError: string | null;
  routingError: string | null;
  /** true tant que le réseau piéton (route_nodes / route_segments) charge :
   * évite d'afficher "réseau non configuré" alors qu'il n'est simplement
   * pas encore arrivé. */
  routingLoading: boolean;
  reload: () => void;
  toggleFavorite: (locationId: string) => Promise<void>;
}

const CampusContext = createContext<CampusState | undefined>(undefined);

export function CampusProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [campus, setCampus] = useState<Campus | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [locations, setLocations] = useState<CampusLocation[]>([]);
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [routeNodes, setRouteNodes] = useState<RouteNode[]>([]);
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [routingLoading, setRoutingLoading] = useState(true);
  // Numéro de la dernière demande de chargement : une réponse plus
  // ancienne (rechargement rapide, campus changé) n'écrase jamais la
  // plus récente.
  const loadSeqRef = useRef(0);

  // Données SECONDAIRES : chargées séparément, une erreur ici ne casse
  // jamais la carte (ÉTAPE 9 du cahier des charges).
  const loadSecondary = useCallback(async (campusId: string, seq: number) => {
    setRoutingLoading(true);
    const [evRes, annRes, nodesRes, segRes] = await Promise.allSettled([
      getEvents(campusId),
      getAnnouncements(campusId),
      getRouteNodes(campusId),
      getRouteSegments(campusId),
    ]);
    if (seq !== loadSeqRef.current) return; // réponse périmée

    if (evRes.status === 'fulfilled') {
      setEvents(evRes.value);
      setEventsError(null);
    } else {
      setEventsError("Impossible de charger les événements.");
    }

    if (annRes.status === 'fulfilled') {
      setAnnouncements(annRes.value);
      setAnnouncementsError(null);
    } else {
      setAnnouncementsError('Impossible de charger les annonces.');
    }

    if (nodesRes.status === 'fulfilled' && segRes.status === 'fulfilled') {
      // Écarte les segments qui référencent un nœud supprimé/inexistant
      // (from_node/to_node orphelin) AVANT qu'ils n'atteignent le graphe
      // de routing (nav.ts) — sinon ces arêtes fantômes, bien
      // qu'inoffensives pour A* (elles mènent à une impasse silencieuse),
      // représentent des données de réseau incohérentes (ÉTAPE routing
      // #7). `filterValidSegments` existait déjà dans lib/api.ts mais
      // n'était jamais appelée.
      setRouteNodes(nodesRes.value);
      setRouteSegments(filterValidSegments(nodesRes.value, segRes.value));
      setRoutingError(null);
    } else {
      // Échec du chargement du réseau (RLS, réseau, timeout…) : on GARDE
      // le dernier réseau valide déjà en mémoire (jamais vidé pour une
      // panne passagère) et on expose l'erreur réelle. Si aucun réseau
      // n'avait jamais été chargé, findRoute() (nav.ts) renvoie l'erreur
      // explicite ROUTE_NETWORK_MISSING — jamais un itinéraire fictif.
      setRoutingError('Impossible de charger le réseau piéton du campus.');
    }
    setRoutingLoading(false);
  }, []);

  // Données CRITIQUES : campus, bâtiments, lieux. Les bâtiments sont
  // chargés directement via getBuildings (et non plus reconstruits à
  // partir de locations.map(l => l.building)), donc ils restent visibles
  // même si `locations` est vide (ÉTAPE 9).
  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const c = await getCampus();
      if (seq !== loadSeqRef.current) return;
      setCampus(c);
      if (c) {
        const [bld, locs] = await Promise.all([getBuildings(c.id), getLocations()]);
        if (seq !== loadSeqRef.current) return;
        setBuildings(bld);
        setLocations(locs);
        // Ne bloque jamais l'affichage critique : erreurs gérées en interne.
        void loadSecondary(c.id, seq);
      }
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      logError('campus.load', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de charger les données du campus.',
      );
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [loadSecondary]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let active = true;
    if (session) {
      getFavorites(session.user.id)
        .then((ids) => {
          if (active) setFavorites(new Set(ids));
        })
        .catch(() => undefined);
    } else {
      setFavorites(new Set());
    }
    return () => {
      active = false;
    };
  }, [session]);

  const toggleFavorite = useCallback(
    async (locationId: string) => {
      if (!session) return;
      const isFav = favorites.has(locationId);
      const next = new Set(favorites);
      if (isFav) next.delete(locationId);
      else next.add(locationId);
      setFavorites(next);
      try {
        if (isFav) await removeFavorite(locationId);
        else await addFavorite(locationId);
      } catch {
        setFavorites(favorites);
      }
    },
    [favorites, session],
  );

  const value = useMemo<CampusState>(
    () => ({
      campus,
      buildings,
      locations,
      events,
      announcements,
      routeNodes,
      routeSegments,
      favorites,
      loading,
      error,
      eventsError,
      announcementsError,
      routingError,
      routingLoading,
      reload: load,
      toggleFavorite,
    }),
    [
      campus,
      buildings,
      locations,
      events,
      announcements,
      routeNodes,
      routeSegments,
      favorites,
      loading,
      error,
      eventsError,
      announcementsError,
      routingError,
      routingLoading,
      load,
      toggleFavorite,
    ],
  );

  return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>;
}

export function useCampus(): CampusState {
  const ctx = useContext(CampusContext);
  if (!ctx) throw new Error('useCampus must be used within CampusProvider');
  return ctx;
}
