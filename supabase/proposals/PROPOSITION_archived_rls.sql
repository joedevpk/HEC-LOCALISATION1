-- ============================================================================
-- PROPOSITION — NON APPLIQUÉE. À relire et valider avant toute exécution.
-- Ce fichier n'est PAS dans supabase/migrations/ : il ne sera jamais exécuté
-- automatiquement. À tester d'abord sur une base de préproduction.
--
-- Constat (migration 20260903090000_archive_campus_entities.sql) :
--   le commentaire des colonnes `archived_at` annonce « caché du public »,
--   mais les policies de lecture publiques sont restées `USING (true)`.
--   Le filtrage « actif / archivé » n'est fait que par le client (src/lib/api.ts,
--   `.is('archived_at', null)`). Un appel direct à l'API REST avec la clé
--   publique (anon) peut donc encore lire les lignes archivées.
--
-- Effet de cette proposition :
--   - public / utilisateurs : ne voient que les lignes avec archived_at IS NULL ;
--   - administrateurs de campus (is_campus_admin()) : voient tout, y compris
--     les archivés (nécessaire à l'écran d'administration « Restaurer »).
--   - aucune donnée n'est modifiée ou supprimée ; seules 4 policies de LECTURE
--     sont remplacées. Les policies d'écriture admin ne sont pas touchées.
--
-- Pré-requis : colonne archived_at présente (migration 20260903090000) et
-- fonction is_campus_admin() (migration 20260826090000).
--
-- Retour arrière : recréer les policies d'origine :
--   CREATE POLICY "public_read_buildings" ON buildings FOR SELECT TO anon, authenticated USING (true);
--   (idem locations, route_nodes, route_segments)
--
-- Risque à vérifier avant application : toute requête client qui lit un
-- bâtiment archivé via une jointure (ex. une salle active dont le bâtiment est
-- archivé) ne le verra plus ; tester l'affichage des fiches et des itinéraires.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "public_read_buildings" ON buildings;
CREATE POLICY "public_read_buildings" ON buildings
  FOR SELECT TO anon, authenticated
  USING (archived_at IS NULL OR is_campus_admin());

DROP POLICY IF EXISTS "public_read_locations" ON locations;
CREATE POLICY "public_read_locations" ON locations
  FOR SELECT TO anon, authenticated
  USING (archived_at IS NULL OR is_campus_admin());

DROP POLICY IF EXISTS "public_read_route_nodes" ON route_nodes;
CREATE POLICY "public_read_route_nodes" ON route_nodes
  FOR SELECT TO anon, authenticated
  USING (archived_at IS NULL OR is_campus_admin());

DROP POLICY IF EXISTS "public_read_route_segments" ON route_segments;
CREATE POLICY "public_read_route_segments" ON route_segments
  FOR SELECT TO anon, authenticated
  USING (archived_at IS NULL OR is_campus_admin());

COMMIT;
