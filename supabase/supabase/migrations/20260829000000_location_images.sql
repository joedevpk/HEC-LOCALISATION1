/*
# Photos des salles / lieux (location_images) — PROBLÈME 2 du cahier des charges

## Overview
`building_images` (migration 20260828100000) a donné une galerie de photos
aux bâtiments, mais pas aux salles/lieux individuels (`locations`). Le
cahier des charges demande explicitement qu'une salle ("Salle A101") puisse
avoir sa propre photo, distincte de la photo du bâtiment qui la contient.

Cette migration reproduit exactement le même schéma et les mêmes garanties
que `building_images`, appliqué à `locations` :
- une table `location_images` ;
- un bucket Storage public dédié `location-images` (séparé de
  `building-images` pour ne jamais mélanger les deux galeries et garder
  des règles de nettoyage indépendantes) ;
- une seule photo principale par lieu, appliquée par trigger côté base
  (pas seulement côté client) ;
- lecture publique, écriture réservée aux rôles admin via
  `is_campus_admin()` (déjà définie par 20260826090000).

Purement additif : aucune table existante n'est modifiée. Tant qu'aucune
image n'est ajoutée pour un lieu donné, l'application continue de
fonctionner exactement comme avant (repli sur la photo du bâtiment, ou sur
l'icône de catégorie si le bâtiment lui-même n'a pas de photo).
*/

CREATE TABLE IF NOT EXISTS location_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  caption text NOT NULL DEFAULT '',
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS location_images_location_idx ON location_images (location_id);
CREATE INDEX IF NOT EXISTS location_images_primary_idx ON location_images (location_id, is_primary);

-- Une seule image principale par lieu (même logique que
-- enforce_single_primary_building_image, appliquée à location_images).
CREATE OR REPLACE FUNCTION enforce_single_primary_location_image()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE location_images
    SET is_primary = false
    WHERE location_id = NEW.location_id
      AND id <> NEW.id
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_primary_location_image ON location_images;
CREATE TRIGGER trg_single_primary_location_image
  AFTER INSERT OR UPDATE OF is_primary ON location_images
  FOR EACH ROW
  WHEN (NEW.is_primary)
  EXECUTE FUNCTION enforce_single_primary_location_image();

ALTER TABLE location_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_location_images" ON location_images;
CREATE POLICY "public_read_location_images" ON location_images FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_insert_location_images" ON location_images;
CREATE POLICY "admin_insert_location_images" ON location_images FOR INSERT TO authenticated
  WITH CHECK (is_campus_admin());

DROP POLICY IF EXISTS "admin_update_location_images" ON location_images;
CREATE POLICY "admin_update_location_images" ON location_images FOR UPDATE TO authenticated
  USING (is_campus_admin()) WITH CHECK (is_campus_admin());

DROP POLICY IF EXISTS "admin_delete_location_images" ON location_images;
CREATE POLICY "admin_delete_location_images" ON location_images FOR DELETE TO authenticated
  USING (is_campus_admin());

-- ---------------------------------------------------------------------
-- Supabase Storage : bucket public "location-images"
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'location-images',
  'location-images',
  true,
  8388608, -- 8 Mo par fichier
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

DROP POLICY IF EXISTS "public_read_location_images_objects" ON storage.objects;
CREATE POLICY "public_read_location_images_objects" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'location-images');

DROP POLICY IF EXISTS "admin_write_location_images_objects" ON storage.objects;
CREATE POLICY "admin_write_location_images_objects" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'location-images' AND is_campus_admin());

DROP POLICY IF EXISTS "admin_update_location_images_objects" ON storage.objects;
CREATE POLICY "admin_update_location_images_objects" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'location-images' AND is_campus_admin())
  WITH CHECK (bucket_id = 'location-images' AND is_campus_admin());

DROP POLICY IF EXISTS "admin_delete_location_images_objects" ON storage.objects;
CREATE POLICY "admin_delete_location_images_objects" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'location-images' AND is_campus_admin());
