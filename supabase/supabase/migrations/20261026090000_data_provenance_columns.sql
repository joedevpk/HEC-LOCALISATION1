-- ============================================================
-- Provenance et qualité des données (additif, idempotent, réversible).
-- Ne supprime ni ne modifie aucune donnée existante, ne touche à aucune RLS.
--
-- verification_status : 'pending' (à valider) | 'validated' | 'archived'
-- data_source         : origine déclarée ('seed_demo', 'admin', 'import_csv', 'field_survey'…)
-- location_accuracy   : précision déclarée des coordonnées, en mètres (NULL = inconnue)
-- verified_at / verified_by : qui a validé et quand
-- photo_verified      : la photo principale est une vraie photo officielle
--
-- Les lignes existantes reçoivent 'pending' : AUCUNE donnée n'est déclarée
-- validée automatiquement. Seules les lignes d'exemple de la migration
-- 20260903100000 (IDs fixes) sont marquées data_source = 'seed_demo'.
--
-- Retour arrière (à exécuter manuellement si nécessaire) :
--   ALTER TABLE buildings DROP COLUMN IF EXISTS verification_status, DROP COLUMN IF EXISTS verified_at,
--     DROP COLUMN IF EXISTS verified_by, DROP COLUMN IF EXISTS data_source,
--     DROP COLUMN IF EXISTS location_accuracy, DROP COLUMN IF EXISTS photo_verified;
--   (idem pour locations)
-- ============================================================

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS data_source text;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS location_accuracy numeric;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS photo_verified boolean NOT NULL DEFAULT false;

ALTER TABLE locations ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS data_source text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS location_accuracy numeric;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS photo_verified boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'buildings_verification_status_chk') THEN
    ALTER TABLE buildings ADD CONSTRAINT buildings_verification_status_chk
      CHECK (verification_status IN ('pending', 'validated', 'archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_verification_status_chk') THEN
    ALTER TABLE locations ADD CONSTRAINT locations_verification_status_chk
      CHECK (verification_status IN ('pending', 'validated', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS buildings_verification_idx ON buildings(verification_status);
CREATE INDEX IF NOT EXISTS locations_verification_idx ON locations(verification_status);

-- Marquage des seules lignes d'exemple connues (IDs fixes de la migration de seed).
UPDATE buildings SET data_source = 'seed_demo'
 WHERE id = '00000000-0000-4000-a000-000000000b01' AND data_source IS NULL;
UPDATE locations SET data_source = 'seed_demo'
 WHERE building_id = '00000000-0000-4000-a000-000000000b01' AND data_source IS NULL;
