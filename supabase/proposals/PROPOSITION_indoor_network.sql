-- PROPOSITION — NON APPLIQUÉE. À relire, tester sur une copie, sauvegarder, puis exécuter manuellement.
-- Additive uniquement (aucun DROP, aucune suppression de données). Aucune donnée n'est inventée.
ALTER TABLE route_nodes ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES buildings(id) ON DELETE SET NULL;
ALTER TABLE route_nodes ADD COLUMN IF NOT EXISTS floor_id uuid REFERENCES floors(id) ON DELETE SET NULL;
ALTER TABLE route_nodes ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';
ALTER TABLE route_nodes ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE route_nodes ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE route_nodes ADD COLUMN IF NOT EXISTS data_source text;
ALTER TABLE route_segments ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';
ALTER TABLE route_segments ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE route_segments ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE route_segments ADD COLUMN IF NOT EXISTS data_source text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'route_nodes_verification_chk') THEN
    ALTER TABLE route_nodes ADD CONSTRAINT route_nodes_verification_chk CHECK (verification_status IN ('pending','validated','archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'route_segments_verification_chk') THEN
    ALTER TABLE route_segments ADD CONSTRAINT route_segments_verification_chk CHECK (verification_status IN ('pending','validated','archived'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS route_nodes_building_idx ON route_nodes(building_id);
CREATE INDEX IF NOT EXISTS route_nodes_floor_idx ON route_nodes(floor_id);
-- Retour arrière : ALTER TABLE ... DROP COLUMN IF EXISTS <colonnes ci-dessus> ; DROP INDEX IF EXISTS ...
-- Les anciens nœuds restent 'pending' : le moteur intérieur ne devra utiliser que 'validated'.
