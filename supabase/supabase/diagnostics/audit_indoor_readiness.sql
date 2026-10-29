-- LECTURE SEULE — état de préparation du routage intérieur.
SELECT 'bâtiments' AS element, count(*) FROM buildings WHERE archived_at IS NULL
UNION ALL SELECT 'nœuds de réseau', count(*) FROM route_nodes WHERE archived_at IS NULL
UNION ALL SELECT 'segments de réseau', count(*) FROM route_segments WHERE archived_at IS NULL
UNION ALL SELECT 'nœuds de type entrée', count(*) FROM route_nodes WHERE type = 'entrance' AND archived_at IS NULL
UNION ALL SELECT 'salles/lieux sans étage', count(*) FROM locations WHERE floor_id IS NULL AND building_id IS NOT NULL AND archived_at IS NULL;
-- Nœuds isolés (aucun segment) :
SELECT n.id, n.type, n.label FROM route_nodes n
 WHERE n.archived_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM route_segments s WHERE s.archived_at IS NULL AND (s.from_node = n.id OR s.to_node = n.id));
