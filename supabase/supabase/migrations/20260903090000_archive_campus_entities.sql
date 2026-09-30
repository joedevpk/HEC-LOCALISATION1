-- Archivage (ÉTAPE "Archivage" du cahier des charges) : remplace la
-- suppression définitive par une désactivation réversible pour les
-- bâtiments, les salles et le réseau de chemins (nœuds/segments).
--
-- Principe : on ajoute une colonne `archived_at` nullable. `NULL` =
-- actif (comportement actuel, inchangé). Une date = archivé. Aucune
-- ligne existante n'est supprimée ni recréée ; les policies RLS restent
-- inchangées (la visibilité "archivé/actif" est filtrée côté client,
-- comme le fait déjà le reste du projet avec `campus_id`, `building_id`,
-- etc.) — cohérent avec l'architecture existante, pas de doublon.

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE route_nodes ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE route_segments ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS buildings_archived_idx ON buildings(archived_at);
CREATE INDEX IF NOT EXISTS locations_archived_idx ON locations(archived_at);
CREATE INDEX IF NOT EXISTS route_nodes_archived_idx ON route_nodes(archived_at);
CREATE INDEX IF NOT EXISTS route_segments_archived_idx ON route_segments(archived_at);

COMMENT ON COLUMN buildings.archived_at IS
  'NULL = actif et visible partout. Une date = archivé : caché du public et de la navigation, mais conservé et restaurable par un admin.';
COMMENT ON COLUMN locations.archived_at IS
  'NULL = actif et visible partout. Une date = archivé : caché du public et de la navigation, mais conservé et restaurable par un admin.';
COMMENT ON COLUMN route_nodes.archived_at IS
  'NULL = actif, utilisé par le calcul d''itinéraire. Une date = archivé : exclu du graphe de navigation, conservé pour restauration.';
COMMENT ON COLUMN route_segments.archived_at IS
  'NULL = actif, utilisé par le calcul d''itinéraire. Une date = archivé : exclu du graphe de navigation, conservé pour restauration.';
