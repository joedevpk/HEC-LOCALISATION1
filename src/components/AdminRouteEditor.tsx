import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MLMap } from 'maplibre-gl';
import {
  Accessibility,
  AlertTriangle,
  Check,
  Layers,
  Link2,
  Loader2,
  MousePointer2,
  Plus,
  Route,
  Trash2,
  Waypoints,
  X,
} from 'lucide-react';
import { getMapStyle } from '@/lib/map-config';
import { toLngLat } from '@/lib/geo-validation';
import { haversine, formatDistance } from '@/lib/nav';
import {
  createRouteNode,
  createRouteSegment,
  deleteRouteNodeCascade,
  deleteRouteSegment,
  getRouteNodes,
  getRouteSegments,
  updateRouteNode,
  updateRouteSegment,
} from '@/lib/api';
import { Button } from '@/components/ui';
import {
  routeNodeTypeColors,
  routeNodeTypeLabels,
  routeSegmentTypeLabels,
} from '@/lib/display';
import type {
  Campus,
  RouteNode,
  RouteNodeType,
  RouteSegment,
  RouteSegmentType,
} from '@/lib/types';

const NODE_TYPES: RouteNodeType[] = [
  'entrance',
  'intersection',
  'corridor',
  'stairs',
  'elevator',
  'ramp',
  'poi',
];
const SEGMENT_TYPES: RouteSegmentType[] = [
  'walkway',
  'corridor',
  'stairs',
  'ramp',
  'elevator',
];

// Un clic à moins de cette distance d'un nœud existant réutilise ce nœud
// au lieu d'en créer un nouveau — évite de dupliquer des nœuds quasiment
// superposés quand l'administrateur reconnecte un chemin existant.
const SNAP_DISTANCE_M = 6;

// Seuil au-delà duquel un segment est probablement une erreur de saisie
// (mauvais clic, node déplacé par erreur, etc.) plutôt qu'un vrai chemin
// piéton sur le campus. Ce n'est pas un blocage dur : l'administrateur est
// simplement invité à confirmer. À ajuster si l'échelle réelle du campus
// (superficie couverte par `campus`) le justifie.
const MAX_SEGMENT_DISTANCE_M = 400;

// ASSOMPTION À VÉRIFIER : les clés de style ci-dessous doivent correspondre
// exactement à ce que `getMapStyle()` accepte dans src/lib/map-config.ts
// (voir aussi CampusMap.tsx pour les valeurs déjà utilisées ailleurs dans le
// projet). Si une clé n'existe pas côté map-config.ts, retirez-la de ce
// tableau — ne pas inventer de nouveaux styles côté composant.
type MapStyleKey = Parameters<typeof getMapStyle>[0];
const MAP_STYLE_OPTIONS: { key: MapStyleKey; label: string }[] = [
  { key: 'plan' as MapStyleKey, label: 'Plan' },
  { key: 'satellite' as MapStyleKey, label: 'Satellite' },
  { key: 'hybrid' as MapStyleKey, label: 'Hybride' },
  { key: 'dark' as MapStyleKey, label: 'Sombre' },
];

type EditorMode = 'select' | 'add' | 'connect' | 'path';

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-hec-950 focus:border-hec-400 focus:outline-none focus:ring-4 focus:ring-hec-100';

/**
 * Éditeur du réseau piéton (route_nodes + route_segments), source réelle
 * consommée ensuite par buildGraphRoute(). Ce composant ne calcule jamais
 * lui-même un itinéraire : il ne fait que créer/modifier/supprimer les
 * nœuds et segments, en s'appuyant strictement sur api.ts pour toute
 * écriture (aucun accès Supabase direct, aucun contournement RLS).
 *
 * Quatre modes :
 * - select  : sélectionner un nœud/segment pour le modifier, glisser un nœud
 *             pour le déplacer ;
 * - add     : cliquer sur la carte pour créer un nœud isolé (aucun segment) ;
 * - connect : sélectionner deux nœuds existants, prévisualiser puis
 *             confirmer explicitement la création du segment ;
 * - path    : tracé continu (comportement historique) — chaque clic crée ou
 *             réutilise un nœud et le relie au précédent par un segment.
 */
export function AdminRouteEditor({ campus }: { campus: Campus }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  const [nodes, setNodes] = useState<RouteNode[]>([]);
  const [segments, setSegments] = useState<RouteSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<EditorMode>('select');
  const [pointType, setPointType] = useState<RouteNodeType>('intersection');
  const [segmentType, setSegmentType] = useState<RouteSegmentType>('walkway');
  const [accessible, setAccessible] = useState(true);
  const [chainNodeId, setChainNodeId] = useState<string | null>(null);

  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectTo, setConnectTo] = useState<string | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  const [styleKey, setStyleKey] = useState<MapStyleKey>('plan' as MapStyleKey);

  // Les callbacks des écouteurs MapLibre (créés une seule fois) doivent
  // toujours voir l'état le plus récent sans recréer la carte à chaque
  // rendu — même pattern que CampusMap.tsx.
  const stateRef = useRef({
    mode,
    pointType,
    segmentType,
    accessible,
    chainNodeId,
    connectFrom,
    connectTo,
    nodes,
    segments,
  });
  stateRef.current = {
    mode,
    pointType,
    segmentType,
    accessible,
    chainNodeId,
    connectFrom,
    connectTo,
    nodes,
    segments,
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedSegment = segments.find((s) => s.id === selectedSegmentId) ?? null;
  const connectFromNode = nodes.find((n) => n.id === connectFrom) ?? null;
  const connectToNode = nodes.find((n) => n.id === connectTo) ?? null;

  // Segments dont un des deux nœuds n'existe plus (données incohérentes,
  // jamais générées par ce composant mais à détecter au chargement). On ne
  // les supprime jamais automatiquement : on les signale et on les exclut
  // de l'affichage carte.
  const orphanSegments = segments.filter(
    (s) => !nodes.some((n) => n.id === s.from_node) || !nodes.some((n) => n.id === s.to_node),
  );

  // Diagnostic du réseau (PHASE 1.6) : calculé sur les données réellement
  // chargées, jamais estimé. Aucune correction automatique : on signale.
  const diagnostics = (() => {
    const ids = new Set(nodes.map((n) => n.id));
    const connected = new Set<string>();
    let zeroDistance = 0;
    let selfLoops = 0;
    const pairKeys = new Set<string>();
    let duplicateSegments = 0;
    for (const sg of segments) {
      if (ids.has(sg.from_node)) connected.add(sg.from_node);
      if (ids.has(sg.to_node)) connected.add(sg.to_node);
      if (!Number.isFinite(sg.distance) || sg.distance <= 0) zeroDistance += 1;
      if (sg.from_node === sg.to_node) selfLoops += 1;
      const key = [sg.from_node, sg.to_node].sort().join('|');
      if (pairKeys.has(key)) duplicateSegments += 1;
      pairKeys.add(key);
    }
    const isolatedNodes = nodes.filter((n) => !connected.has(n.id)).length;
    const coordKeys = new Set<string>();
    let duplicateNodes = 0;
    for (const n of nodes) {
      const k = `${n.lat.toFixed(6)},${n.lng.toFixed(6)}`;
      if (coordKeys.has(k)) duplicateNodes += 1;
      coordKeys.add(k);
    }
    const invalidSegments = orphanSegments.length + selfLoops + zeroDistance;
    return { isolatedNodes, invalidSegments, zeroDistance, selfLoops, duplicateNodes, duplicateSegments };
  })();

  function flashNotice(message: string) {
    setNotice(message);
  }

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  async function loadNetwork() {
    setLoading(true);
    setError(null);
    try {
      const [n, s] = await Promise.all([
        getRouteNodes(campus.id),
        getRouteSegments(campus.id),
      ]);
      setNodes(n);
      setSegments(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement du réseau impossible.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNetwork();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus.id]);

  function setupNetworkLayers(map: MLMap) {
    if (!map.getSource('admin-segments')) {
      map.addSource('admin-segments', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!map.getLayer('admin-segments-line')) {
      map.addLayer({
        id: 'admin-segments-line',
        type: 'line',
        source: 'admin-segments',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'accessible'], false],
            '#f59e0b',
            '#1e5eff',
          ],
          'line-width': 4,
        },
      });
      map.on('click', 'admin-segments-line', (e) => {
        if (stateRef.current.mode !== 'select') return;
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) {
          setSelectedSegmentId(id);
          setSelectedNodeId(null);
        }
      });
    }
    // Réinjecte immédiatement les données déjà en mémoire (utile après un
    // changement de style, qui vide les sources custom de MapLibre).
    const src = map.getSource('admin-segments') as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(buildSegmentsGeoJSON(stateRef.current.nodes, stateRef.current.segments) as never);
    }
  }

  // Création de la carte (une seule fois)
  useEffect(() => {
    // La Map n'est jamais réassignée : on la copie pour le nettoyage.
    const markers = markersRef.current;
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle('plan' as MapStyleKey),
      center: [campus.center_lng, campus.center_lat],
      zoom: campus.default_zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      setupNetworkLayers(map);
      readyRef.current = true;
    });

    // Après un changement de style (setStyle), MapLibre vide les sources et
    // layers custom : on les recrée. Les markers DOM (nœuds) ne sont pas
    // affectés par le style et n'ont donc pas besoin d'être recréés.
    map.on('style.load', () => {
      if (!readyRef.current) return; // déjà géré par 'load' au premier chargement
      setupNetworkLayers(map);
    });

    map.on('click', (e) => {
      const currentMode = stateRef.current.mode;
      if (currentMode === 'path') {
        void handlePathClick(e.lngLat.lng, e.lngLat.lat);
      } else if (currentMode === 'add') {
        void handleAddClick(e.lngLat.lng, e.lngLat.lat);
      }
      // en mode 'select' et 'connect', le clic carte ne fait rien : seules
      // les sélections de nœuds/segments existants comptent.
    });

    return () => {
      markers.forEach((m) => m.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus.id]);

  // Changement de style de fond de carte
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setStyle(getMapStyle(styleKey));
  }, [styleKey]);

  // Rendu des nœuds (marqueurs DOM)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const seen = new Set<string>();
    for (const node of nodes) {
      const pos = toLngLat(node.lng, node.lat);
      if (!pos) continue; // garde-fou anti-crash : jamais de node à coordonnées invalides
      seen.add(node.id);
      let marker = markersRef.current.get(node.id);
      if (!marker) {
        const el = document.createElement('button');
        el.type = 'button';
        el.style.cssText =
          'width:14px;height:14px;border-radius:9999px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer;';
        el.addEventListener('click', (evt) => {
          evt.stopPropagation();
          handleNodeClick(node.id);
        });
        marker = new maplibregl.Marker({ element: el, draggable: false }).setLngLat(pos).addTo(map);
        marker.on('dragend', () => {
          const { lng, lat } = marker!.getLngLat();
          void handleMoveNode(node.id, lng, lat);
        });
        markersRef.current.set(node.id, marker);
      } else {
        marker.setLngLat(pos);
      }
      // Le déplacement à la souris n'a de sens qu'en mode sélection : dans
      // les autres modes le clic sur un nœud a une signification différente
      // (chaînage, connexion) et ne doit pas déclencher un drag accidentel.
      marker.setDraggable(mode === 'select');
      const el = marker.getElement();
      el.style.background = routeNodeTypeColors[node.type];
      el.title = node.label || routeNodeTypeLabels[node.type];
      const isHighlighted =
        node.id === selectedNodeId ||
        node.id === chainNodeId ||
        node.id === connectFrom ||
        node.id === connectTo;
      el.style.outline = isHighlighted ? '3px solid #0f172a' : 'none';
    }
    for (const [id, marker] of markersRef.current.entries()) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, selectedNodeId, chainNodeId, connectFrom, connectTo, mode]);

  // Rendu des segments
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource('admin-segments') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(buildSegmentsGeoJSON(nodes, segments) as never);
  }, [segments, nodes]);

  function buildSegmentsGeoJSON(currentNodes: RouteNode[], currentSegments: RouteSegment[]) {
    const nodeById = new Map(currentNodes.map((n) => [n.id, n]));
    const features = currentSegments
      .map((seg) => {
        const from = nodeById.get(seg.from_node);
        const to = nodeById.get(seg.to_node);
        if (!from || !to) return null; // segment orphelin : jamais affiché comme valide
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [from.lng, from.lat],
              [to.lng, to.lat],
            ],
          },
          properties: { id: seg.id, accessible: seg.accessible },
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);
    return { type: 'FeatureCollection', features };
  }

  function findSnapTarget(lng: number, lat: number, currentNodes: RouteNode[]) {
    const nearest = currentNodes.reduce<{ node: RouteNode; d: number } | null>((best, n) => {
      const d = haversine([lng, lat], [n.lng, n.lat]);
      if (!best || d < best.d) return { node: n, d };
      return best;
    }, null);
    if (nearest && nearest.d <= SNAP_DISTANCE_M) return nearest.node;
    return null;
  }

  function segmentAlreadyExists(a: string, b: string, currentSegments: RouteSegment[]) {
    return currentSegments.some(
      (s) => (s.from_node === a && s.to_node === b) || (s.from_node === b && s.to_node === a),
    );
  }

  // Vérifie la validité topologique d'un futur segment A -> B et calcule sa
  // distance réelle. Ne demande jamais à l'administrateur de saisir une
  // distance manuellement.
  function checkSegmentCandidate(
    from: RouteNode,
    to: RouteNode,
    currentSegments: RouteSegment[],
  ): { ok: true; distance: number } | { ok: false; message: string } {
    if (from.id === to.id) {
      return { ok: false, message: 'Un segment ne peut pas relier un nœud à lui-même.' };
    }
    const fromPos = toLngLat(from.lng, from.lat);
    const toPos = toLngLat(to.lng, to.lat);
    if (!fromPos || !toPos) {
      return { ok: false, message: 'Coordonnées invalides pour ce segment.' };
    }
    if (segmentAlreadyExists(from.id, to.id, currentSegments)) {
      return { ok: false, message: 'Un segment relie déjà ces deux nœuds.' };
    }
    const distance = haversine([from.lng, from.lat], [to.lng, to.lat]);
    if (!(distance > 0)) {
      return { ok: false, message: 'Distance calculée invalide (0 ou négative).' };
    }
    return { ok: true, distance };
  }

  function confirmIfTooLong(distance: number) {
    if (distance <= MAX_SEGMENT_DISTANCE_M) return true;
    return window.confirm(
      `Ce segment mesure ${formatDistance(distance)}, ce qui semble long pour un réseau piéton de campus. Créer quand même ?`,
    );
  }

  // ---- Mode "Tracer un chemin" (comportement historique conservé) ----
  async function handlePathClick(lng: number, lat: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { nodes: currentNodes, segments: currentSegments } = stateRef.current;
      let target = findSnapTarget(lng, lat, currentNodes);
      let created: RouteNode | null = null;
      if (!target) {
        created = await createRouteNode({
          campus_id: campus.id,
          lng,
          lat,
          type: stateRef.current.pointType,
          label: null,
        });
        setNodes((prev) => [...prev, created as RouteNode]);
        target = created;
      }

      const { chainNodeId: currentChain } = stateRef.current;
      if (currentChain && currentChain !== target.id) {
        const fromNode =
          currentNodes.find((n) => n.id === currentChain) ??
          (stateRef.current.nodes.find((n) => n.id === currentChain) as RouteNode | undefined);
        if (fromNode) {
          const check = checkSegmentCandidate(fromNode, target, currentSegments);
          if (!check.ok) {
            setError(check.message);
          } else if (confirmIfTooLong(check.distance)) {
            const createdSegment = await createRouteSegment({
              campus_id: campus.id,
              from_node: currentChain,
              to_node: target.id,
              distance: check.distance,
              accessible: stateRef.current.accessible,
              segment_type: stateRef.current.segmentType,
            });
            setSegments((prev) => [...prev, createdSegment]);
            flashNotice('Segment créé.');
          }
        }
      } else if (created) {
        flashNotice('Nœud créé.');
      }
      setChainNodeId(target.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer ce point.');
    } finally {
      setBusy(false);
    }
  }

  async function connectChainToExistingNode(nodeId: string) {
    if (busy) return;
    const { chainNodeId: currentChain, nodes: currentNodes, segments: currentSegments } = stateRef.current;
    if (currentChain && currentChain !== nodeId) {
      setBusy(true);
      setError(null);
      try {
        const fromNode = currentNodes.find((n) => n.id === currentChain);
        const toNode = currentNodes.find((n) => n.id === nodeId);
        if (fromNode && toNode) {
          const check = checkSegmentCandidate(fromNode, toNode, currentSegments);
          if (!check.ok) {
            setError(check.message);
          } else if (confirmIfTooLong(check.distance)) {
            const createdSegment = await createRouteSegment({
              campus_id: campus.id,
              from_node: currentChain,
              to_node: nodeId,
              distance: check.distance,
              accessible: stateRef.current.accessible,
              segment_type: stateRef.current.segmentType,
            });
            setSegments((prev) => [...prev, createdSegment]);
            flashNotice('Segment créé.');
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Impossible de créer ce segment.');
      } finally {
        setBusy(false);
      }
    }
    setChainNodeId(nodeId);
  }

  // ---- Mode "Ajouter un point" ----
  async function handleAddClick(lng: number, lat: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { nodes: currentNodes } = stateRef.current;
      const existing = findSnapTarget(lng, lat, currentNodes);
      if (existing) {
        setSelectedNodeId(existing.id);
        flashNotice('Un nœud existe déjà à cet endroit — sélectionné au lieu d’en créer un doublon.');
        return;
      }
      const created = await createRouteNode({
        campus_id: campus.id,
        lng,
        lat,
        type: stateRef.current.pointType,
        label: null,
      });
      setNodes((prev) => [...prev, created]);
      setSelectedNodeId(created.id);
      flashNotice('Node créé.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer ce point.');
    } finally {
      setBusy(false);
    }
  }

  // ---- Mode "Connecter deux points" ----
  function handleConnectNodeClick(nodeId: string) {
    const { connectFrom: from, connectTo: to } = stateRef.current;
    if (!from) {
      setConnectFrom(nodeId);
      setConnectTo(null);
      return;
    }
    if (from === nodeId) {
      // reclique sur le même nœud : annule la sélection de départ
      setConnectFrom(null);
      setConnectTo(null);
      return;
    }
    if (!to) {
      setConnectTo(nodeId);
      return;
    }
    // A et B déjà choisis : un nouveau clic redémarre la sélection avec ce nœud
    setConnectFrom(nodeId);
    setConnectTo(null);
  }

  async function handleConfirmConnect() {
    if (!connectFromNode || !connectToNode || busy) return;
    setBusy(true);
    setError(null);
    try {
      const check = checkSegmentCandidate(connectFromNode, connectToNode, stateRef.current.segments);
      if (!check.ok) {
        setError(check.message);
        return;
      }
      if (!confirmIfTooLong(check.distance)) return;
      const createdSegment = await createRouteSegment({
        campus_id: campus.id,
        from_node: connectFromNode.id,
        to_node: connectToNode.id,
        distance: check.distance,
        accessible,
        segment_type: segmentType,
      });
      setSegments((prev) => [...prev, createdSegment]);
      setConnectFrom(null);
      setConnectTo(null);
      flashNotice('Segment créé.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer ce segment.');
    } finally {
      setBusy(false);
    }
  }

  // ---- Sélection générale d'un nœud (dépend du mode courant) ----
  function handleNodeClick(nodeId: string) {
    const currentMode = stateRef.current.mode;
    if (currentMode === 'path') {
      void connectChainToExistingNode(nodeId);
    } else if (currentMode === 'connect') {
      handleConnectNodeClick(nodeId);
    } else if (currentMode === 'add') {
      // en mode ajout, cliquer un nœud existant le sélectionne simplement
      setSelectedNodeId(nodeId);
    } else {
      setSelectedNodeId(nodeId);
      setSelectedSegmentId(null);
    }
  }

  // ---- Déplacement d'un nœud (drag ou édition manuelle des coordonnées) ----
  // ASSOMPTION À VÉRIFIER : updateRouteNode accepte une mise à jour partielle
  // incluant { lng, lat }, et updateRouteSegment accepte { distance }. Si
  // api.ts expose des signatures plus strictes (ex. un update dédié au
  // déplacement), adapter ces deux appels en conséquence.
  async function handleMoveNode(nodeId: string, newLng: number, newLat: number) {
    const pos = toLngLat(newLng, newLat);
    if (!pos) {
      setError('Coordonnées invalides : le nœud n’a pas été déplacé.');
      return;
    }
    const previous = stateRef.current.nodes.find((n) => n.id === nodeId);
    if (!previous) return;

    setBusy(true);
    setError(null);
    // Mise à jour optimiste locale pour un rendu immédiat du marker.
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, lng: newLng, lat: newLat } : n)));

    try {
      const updatedNode = await updateRouteNode(nodeId, { lng: newLng, lat: newLat });
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? updatedNode : n)));

      const connected = stateRef.current.segments.filter(
        (s) => s.from_node === nodeId || s.to_node === nodeId,
      );
      const latestNodes = stateRef.current.nodes.map((n) =>
        n.id === nodeId ? { ...n, lng: newLng, lat: newLat } : n,
      );
      const failedSegmentIds: string[] = [];
      for (const seg of connected) {
        const from = latestNodes.find((n) => n.id === seg.from_node);
        const to = latestNodes.find((n) => n.id === seg.to_node);
        if (!from || !to) continue;
        const distance = haversine([from.lng, from.lat], [to.lng, to.lat]);
        try {
          const updatedSeg = await updateRouteSegment(seg.id, { distance });
          setSegments((prev) => prev.map((s) => (s.id === seg.id ? updatedSeg : s)));
        } catch {
          failedSegmentIds.push(seg.id);
        }
      }
      if (failedSegmentIds.length > 0) {
        setError(
          `Le nœud a été déplacé, mais ${failedSegmentIds.length} segment(s) n’ont pas pu être recalculés. Rechargez pour vérifier.`,
        );
      } else {
        flashNotice('Position enregistrée.');
      }
    } catch (err) {
      // Échec de la sauvegarde : on restaure la position précédente pour ne
      // jamais laisser l'état local prétendre à une sauvegarde qui a échoué.
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? previous : n)));
      const marker = markersRef.current.get(nodeId);
      if (marker) {
        const pos2 = toLngLat(previous.lng, previous.lat);
        if (pos2) marker.setLngLat(pos2);
      }
      setError(err instanceof Error ? err.message : 'Déplacement impossible : position restaurée.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteNode(id: string) {
    const connectedCount = segments.filter((s) => s.from_node === id || s.to_node === id).length;
    const confirmed = window.confirm(
      connectedCount > 0
        ? `Ce nœud est connecté à ${connectedCount} segment(s). Supprimer le nœud et ses connexions ?`
        : 'Supprimer ce nœud ?',
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      await deleteRouteNodeCascade(id, segments);
      setSegments((prev) => prev.filter((s) => s.from_node !== id && s.to_node !== id));
      setNodes((prev) => prev.filter((n) => n.id !== id));
      if (selectedNodeId === id) setSelectedNodeId(null);
      if (chainNodeId === id) setChainNodeId(null);
      if (connectFrom === id) setConnectFrom(null);
      if (connectTo === id) setConnectTo(null);
      flashNotice('Nœud supprimé.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSegment(id: string) {
    const confirmed = window.confirm('Supprimer ce segment ?');
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      await deleteRouteSegment(id);
      setSegments((prev) => prev.filter((s) => s.id !== id));
      if (selectedSegmentId === id) setSelectedSegmentId(null);
      flashNotice('Segment supprimé.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveNode(nodeId: string, type: RouteNodeType, label: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateRouteNode(nodeId, { type, label: label.trim() || null });
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? updated : n)));
      flashNotice('Nœud enregistré.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSegment(
    segmentId: string,
    type: RouteSegmentType,
    segAccessible: boolean,
  ) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateRouteSegment(segmentId, {
        segment_type: type,
        accessible: segAccessible,
      });
      setSegments((prev) => prev.map((s) => (s.id === segmentId ? updated : s)));
      flashNotice('Segment enregistré.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: EditorMode) {
    setMode(next);
    setChainNodeId(null);
    setConnectFrom(null);
    setConnectTo(null);
    setSelectedNodeId(null);
    setSelectedSegmentId(null);
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1">
          <ModeButton
            active={mode === 'select'}
            icon={<MousePointer2 className="h-4 w-4" />}
            label="Sélection"
            onClick={() => switchMode('select')}
          />
          <ModeButton
            active={mode === 'add'}
            icon={<Plus className="h-4 w-4" />}
            label="Ajouter un point"
            onClick={() => switchMode('add')}
          />
          <ModeButton
            active={mode === 'connect'}
            icon={<Link2 className="h-4 w-4" />}
            label="Connecter deux points"
            onClick={() => switchMode('connect')}
          />
          <ModeButton
            active={mode === 'path'}
            icon={<Route className="h-4 w-4" />}
            label="Tracer un chemin"
            onClick={() => switchMode('path')}
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          Type de point
          <select
            value={pointType}
            onChange={(e) => setPointType(e.target.value as RouteNodeType)}
            className={`${fieldClass} !w-auto py-1.5`}
            disabled={mode === 'select' || mode === 'connect'}
          >
            {NODE_TYPES.map((t) => (
              <option key={t} value={t}>
                {routeNodeTypeLabels[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          Type de segment
          <select
            value={segmentType}
            onChange={(e) => setSegmentType(e.target.value as RouteSegmentType)}
            className={`${fieldClass} !w-auto py-1.5`}
            disabled={mode === 'select' || mode === 'add'}
          >
            {SEGMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {routeSegmentTypeLabels[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <input
            type="checkbox"
            checked={accessible}
            onChange={(e) => setAccessible(e.target.checked)}
            disabled={mode === 'select' || mode === 'add'}
          />
          <Accessibility className="h-3.5 w-3.5" /> Accessible PMR
        </label>

        {mode === 'path' && chainNodeId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<X className="h-4 w-4" />}
            onClick={() => setChainNodeId(null)}
          >
            Terminer ce tronçon
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-slate-400" />
          <select
            value={styleKey as string}
            onChange={(e) => setStyleKey(e.target.value as MapStyleKey)}
            className={`${fieldClass} !w-auto py-1.5`}
          >
            {MAP_STYLE_OPTIONS.map((opt) => (
              <option key={opt.key as string} value={opt.key as string}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {busy && <Loader2 className="h-4 w-4 animate-spin text-hec-400" />}
      </div>

      {mode === 'path' && (
        <p className="rounded-xl bg-hec-50 px-3.5 py-2.5 text-xs font-medium text-hec-700">
          Cliquez sur la carte pour poser des points successifs : chaque clic
          crée un nœud et le relie au précédent par un segment (distance
          calculée automatiquement). Cliquez un nœud existant pour vous y
          raccorder. « Terminer ce tronçon » avant de démarrer un chemin
          séparé.
        </p>
      )}
      {mode === 'add' && (
        <p className="rounded-xl bg-hec-50 px-3.5 py-2.5 text-xs font-medium text-hec-700">
          Cliquez sur la carte pour créer un nœud isolé (aucun segment
          créé). Utile pour poser une entrée ou un POI avant de le
          raccorder au reste du réseau en mode « Connecter deux points ».
        </p>
      )}
      {mode === 'connect' && (
        <div className="space-y-2 rounded-xl bg-hec-50 px-3.5 py-2.5 text-xs font-medium text-hec-700">
          <p>
            Cliquez un premier nœud existant, puis un second : un aperçu du
            segment (distance réelle incluse) s’affichera ci-dessous avant
            toute création.
          </p>
          {connectFromNode && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2">
              <span className="font-bold text-hec-950">{routeNodeTypeLabels[connectFromNode.type]}</span>
              {connectToNode ? (
                <>
                  <span>→</span>
                  <span className="font-bold text-hec-950">{routeNodeTypeLabels[connectToNode.type]}</span>
                  <span className="ml-auto text-slate-500">
                    {formatDistance(haversine(
                      [connectFromNode.lng, connectFromNode.lat],
                      [connectToNode.lng, connectToNode.lat],
                    ))}
                  </span>
                  <Button type="button" size="sm" icon={<Check className="h-3.5 w-3.5" />} disabled={busy} onClick={handleConfirmConnect}>
                    Créer le segment
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    icon={<X className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setConnectFrom(null);
                      setConnectTo(null);
                    }}
                  >
                    Annuler
                  </Button>
                </>
              ) : (
                <span className="text-slate-500">Sélectionnez le second nœud sur la carte…</span>
              )}
            </div>
          )}
        </div>
      )}

      {!loading && (
        <div
          role="status"
          aria-label="Diagnostic du réseau piéton"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-hec-950"
        >
          <span>{nodes.length} nœud{nodes.length > 1 ? 's' : ''}</span>
          <span>{segments.length} segment{segments.length > 1 ? 's' : ''}</span>
          <span className={diagnostics.isolatedNodes ? 'text-amber-700' : 'text-emerald-700'}>
            {diagnostics.isolatedNodes} nœud{diagnostics.isolatedNodes > 1 ? 's' : ''} isolé{diagnostics.isolatedNodes > 1 ? 's' : ''}
          </span>
          <span className={diagnostics.invalidSegments ? 'text-amber-700' : 'text-emerald-700'}>
            {diagnostics.invalidSegments} segment{diagnostics.invalidSegments > 1 ? 's' : ''} invalide{diagnostics.invalidSegments > 1 ? 's' : ''}
          </span>
          {diagnostics.zeroDistance > 0 && (
            <span className="text-amber-700">dont {diagnostics.zeroDistance} de distance nulle</span>
          )}
          {diagnostics.duplicateNodes > 0 && (
            <span className="text-amber-700">{diagnostics.duplicateNodes} nœud(s) en double (mêmes coordonnées)</span>
          )}
          {diagnostics.duplicateSegments > 0 && (
            <span className="text-amber-700">{diagnostics.duplicateSegments} segment(s) en double</span>
          )}
          {nodes.length === 0 && (
            <span className="w-full font-medium text-slate-500">
              Aucun réseau saisi : « Me guider » affichera « Le réseau piéton de cette zone n'est pas encore configuré. »
            </span>
          )}
        </div>
      )}

      {orphanSegments.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {orphanSegments.length} segment(s) orphelin(s) détecté(s) — nœud
          source ou destination manquant. Ils ne sont pas affichés sur la
          carte et devraient être vérifiés en base.
        </div>
      )}

      {notice && (
        <div className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-700">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600">
          {error}
        </div>
      )}

      <div className="relative h-[480px] overflow-hidden rounded-2xl border border-slate-200">
        <div ref={containerRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-white/70">
            <Loader2 className="h-6 w-6 animate-spin text-hec-500" />
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-hec-950">
            <Waypoints className="h-4 w-4" /> Nœuds ({nodes.length})
          </p>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {nodes.length === 0 && (
              <p className="text-xs text-slate-400">Aucun nœud pour ce campus.</p>
            )}
            {nodes.map((n) => (
              <NodeRow
                key={n.id}
                node={n}
                selected={n.id === selectedNodeId}
                onSelect={() => {
                  setSelectedNodeId(n.id);
                  setSelectedSegmentId(null);
                }}
              />
            ))}
          </div>
          {selectedNode && (
            <NodeEditForm
              node={selectedNode}
              busy={busy}
              onSave={handleSaveNode}
              onMove={handleMoveNode}
              onDelete={() => handleDeleteNode(selectedNode.id)}
              onClose={() => setSelectedNodeId(null)}
            />
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-hec-950">
            <Route className="h-4 w-4" /> Segments ({segments.length})
          </p>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {segments.length === 0 && (
              <p className="text-xs text-slate-400">Aucun segment pour ce campus.</p>
            )}
            {segments.map((s) => (
              <SegmentRow
                key={s.id}
                segment={s}
                orphan={orphanSegments.some((o) => o.id === s.id)}
                selected={s.id === selectedSegmentId}
                onSelect={() => {
                  setSelectedSegmentId(s.id);
                  setSelectedNodeId(null);
                }}
              />
            ))}
          </div>
          {selectedSegment && (
            <SegmentEditForm
              segment={selectedSegment}
              busy={busy}
              onSave={handleSaveSegment}
              onDelete={() => handleDeleteSegment(selectedSegment.id)}
              onClose={() => setSelectedSegmentId(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        active ? 'bg-hec-950 text-white' : 'text-slate-500 hover:bg-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function NodeRow({
  node,
  selected,
  onSelect,
}: {
  node: RouteNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
        selected ? 'bg-hec-50 text-hec-900' : 'hover:bg-slate-50 text-slate-600'
      }`}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: routeNodeTypeColors[node.type] }}
      />
      <span className="font-semibold">{routeNodeTypeLabels[node.type]}</span>
      {node.label && <span className="truncate text-slate-400">— {node.label}</span>}
    </button>
  );
}

function NodeEditForm({
  node,
  busy,
  onSave,
  onMove,
  onDelete,
  onClose,
}: {
  node: RouteNode;
  busy: boolean;
  onSave: (id: string, type: RouteNodeType, label: string) => void;
  onMove: (id: string, lng: number, lat: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [type, setType] = useState(node.type);
  const [label, setLabel] = useState(node.label ?? '');
  const [lat, setLat] = useState(String(node.lat));
  const [lng, setLng] = useState(String(node.lng));

  // Les champs de coordonnées suivent le nœud sélectionné (y compris après
  // un drag sur la carte) sans écraser une saisie en cours sur un autre nœud.
  useEffect(() => {
    setType(node.type);
    setLabel(node.label ?? '');
    setLat(String(node.lat));
    setLng(String(node.lng));
  }, [node.id, node.type, node.label, node.lat, node.lng]);

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  const coordsValid =
    Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLng) &&
    !(parsedLat === 0 && parsedLng === 0) &&
    Math.abs(parsedLat) <= 90 &&
    Math.abs(parsedLng) <= 180;
  const coordsChanged = parsedLat !== node.lat || parsedLng !== node.lng;

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-500">Nœud sélectionné</p>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <select value={type} onChange={(e) => setType(e.target.value as RouteNodeType)} className={fieldClass}>
        {NODE_TYPES.map((t) => (
          <option key={t} value={t}>
            {routeNodeTypeLabels[t]}
          </option>
        ))}
      </select>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Libellé (optionnel)"
        className={fieldClass}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          icon={<Check className="h-3.5 w-3.5" />}
          disabled={busy}
          onClick={() => onSave(node.id, type, label)}
        >
          Enregistrer
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<Trash2 className="h-3.5 w-3.5" />}
          disabled={busy}
          onClick={onDelete}
        >
          Supprimer
        </Button>
      </div>

      <div className="border-t border-slate-200 pt-2">
        <p className="mb-1 text-xs font-bold text-slate-500">Position (peut aussi être glissée sur la carte)</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">
            Latitude
            <input value={lat} onChange={(e) => setLat(e.target.value)} className={fieldClass} inputMode="decimal" />
          </label>
          <label className="text-xs text-slate-500">
            Longitude
            <input value={lng} onChange={(e) => setLng(e.target.value)} className={fieldClass} inputMode="decimal" />
          </label>
        </div>
        {!coordsValid && (
          <p className="mt-1 text-xs font-medium text-red-500">Coordonnées invalides.</p>
        )}
        <Button
          type="button"
          size="sm"
          className="mt-2"
          disabled={busy || !coordsValid || !coordsChanged}
          onClick={() => onMove(node.id, parsedLng, parsedLat)}
        >
          Enregistrer position
        </Button>
      </div>
    </div>
  );
}

function SegmentRow({
  segment,
  selected,
  orphan,
  onSelect,
}: {
  segment: RouteSegment;
  selected: boolean;
  orphan: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
        selected ? 'bg-hec-50 text-hec-900' : 'hover:bg-slate-50 text-slate-600'
      }`}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        {orphan && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
        {routeSegmentTypeLabels[segment.segment_type]}
      </span>
      <span className="text-slate-400">{formatDistance(segment.distance)}</span>
      {!segment.accessible && <Accessibility className="h-3.5 w-3.5 text-amber-500" />}
    </button>
  );
}

function SegmentEditForm({
  segment,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  segment: RouteSegment;
  busy: boolean;
  onSave: (id: string, type: RouteSegmentType, accessible: boolean) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [type, setType] = useState(segment.segment_type);
  const [accessible, setAccessible] = useState(segment.accessible);

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-500">
          Segment sélectionné — {formatDistance(segment.distance)}
        </p>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <select
        value={type}
        onChange={(e) => setType(e.target.value as RouteSegmentType)}
        className={fieldClass}
      >
        {SEGMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {routeSegmentTypeLabels[t]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <input type="checkbox" checked={accessible} onChange={(e) => setAccessible(e.target.checked)} />
        Accessible PMR
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          icon={<Check className="h-3.5 w-3.5" />}
          disabled={busy}
          onClick={() => onSave(segment.id, type, accessible)}
        >
          Enregistrer
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<Trash2 className="h-3.5 w-3.5" />}
          disabled={busy}
          onClick={onDelete}
        >
          Supprimer
        </Button>
      </div>
    </div>
  );
}