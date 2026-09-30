/*
# Reseau de navigation du campus (route_nodes / route_segments)

## Overview
"Me guider" reposait sur une ligne brisee purement geometrique
(src/lib/nav.ts::buildRoute), sans jamais suivre les allees reelles du
campus. Cette migration cree le graphe de navigation reel demande
(ETAPE 5 du cahier des charges) : des noeuds (entrees, intersections,
couloirs, escaliers, ascenseurs, rampes, points d'interet) relies par des
segments, que le moteur de routing (Dijkstra, voir src/lib/nav.ts) peut
parcourir pour calculer un vrai chemin.

Purement additif : aucune table existante n'est modifiee. Tant qu'aucun
noeud n'est saisi par l'administration pour un campus donne, l'application
continue de fonctionner en degradant automatiquement vers l'itineraire
direct existant (aucune casse).

## Changes
- Table `route_nodes` : un point du reseau pietons (entree, intersection,
  couloir, escalier, ascenseur, rampe, POI).
- Table `route_segments` : une arete entre deux noeuds, avec distance en
  metres, accessibilite PMR et type de segment.
- Lecture publique (comme buildings/locations). Ecriture reservee aux
  roles admin via la fonction `is_campus_admin()` deja definie par
  20260826090000_admin_campus_write_access.sql.
- Index sur campus_id et sur les extremites des segments pour des
  requetes de routing rapides.
*/

CREATE TABLE IF NOT EXISTS route_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  lng double precision NOT NULL,
  lat double precision NOT NULL,
  type text NOT NULL DEFAULT 'intersection'
    CHECK (type IN ('entrance', 'intersection', 'corridor', 'stairs', 'elevator', 'ramp', 'poi')),
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  from_node uuid NOT NULL REFERENCES route_nodes(id) ON DELETE CASCADE,
  to_node uuid NOT NULL REFERENCES route_nodes(id) ON DELETE CASCADE,
  distance double precision NOT NULL CHECK (distance >= 0),
  accessible boolean NOT NULL DEFAULT true,
  segment_type text NOT NULL DEFAULT 'walkway'
    CHECK (segment_type IN ('walkway', 'corridor', 'stairs', 'ramp', 'elevator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT route_segments_distinct_nodes CHECK (from_node <> to_node)
);

CREATE INDEX IF NOT EXISTS route_nodes_campus_idx ON route_nodes (campus_id);
CREATE INDEX IF NOT EXISTS route_segments_campus_idx ON route_segments (campus_id);
CREATE INDEX IF NOT EXISTS route_segments_from_idx ON route_segments (from_node);
CREATE INDEX IF NOT EXISTS route_segments_to_idx ON route_segments (to_node);

ALTER TABLE route_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_route_nodes" ON route_nodes;
CREATE POLICY "public_read_route_nodes" ON route_nodes FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public_read_route_segments" ON route_segments;
CREATE POLICY "public_read_route_segments" ON route_segments FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_write_route_nodes" ON route_nodes;
CREATE POLICY "admin_write_route_nodes" ON route_nodes FOR ALL TO authenticated
  USING (is_campus_admin()) WITH CHECK (is_campus_admin());

DROP POLICY IF EXISTS "admin_write_route_segments" ON route_segments;
CREATE POLICY "admin_write_route_segments" ON route_segments FOR ALL TO authenticated
  USING (is_campus_admin()) WITH CHECK (is_campus_admin());
