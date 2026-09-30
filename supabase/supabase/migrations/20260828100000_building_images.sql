/*
# Photos des bâtiments (building_images) — PROBLÈME 1 du cahier des charges

## Overview
Jusqu'ici, un bâtiment n'avait aucune photo réelle : rien dans le schéma
ne permettait d'associer une image à `buildings`. Cette migration ajoute
une vraie galerie d'images par bâtiment, stockée dans Supabase Storage
(jamais en base — seul le chemin/l'URL publique est en base), avec une
photo principale explicite affichée dans les résultats de recherche.

Purement additif : aucune table existante n'est modifiée. Tant qu'aucune
image n'est ajoutée pour un bâtiment donné, l'application continue de
fonctionner exactement comme avant (repli sur l'icône colorée existante).

## Changes
- Table `building_images` : id, building_id, storage_path, public_url,
  caption, is_primary, sort_order, created_at — conforme au cahier des
  charges.
- Contrainte : une seule photo principale par bâtiment, appliquée par un
  trigger (`enforce_single_primary_building_image`) plutôt que laissée à
  la responsabilité du client, pour éviter tout état incohérent même en
  cas d'écriture concurrente ou d'appel direct à l'API Supabase.
- Lecture publique (comme buildings/locations). Écriture réservée aux
  rôles admin via `is_campus_admin()` (déjà définie).
- Bucket de stockage public `building-images` avec policies dédiées :
  lecture publique, écriture réservée aux admins de campus. Les fichiers
  ne sont donc jamais accessibles en écriture à un utilisateur normal,
  même si le bucket est public en lecture.
*/

CREATE TABLE IF NOT EXISTS building_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  caption text NOT NULL DEFAULT '',
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS building_images_building_idx ON building_images (building_id);
CREATE INDEX IF NOT EXISTS building_images_primary_idx ON building_images (building_id, is_primary);

-- Une seule image principale par bâtiment : quand une image est marquée
-- is_primary = true, toutes les autres images du même bâtiment sont
-- automatiquement rétrogradées. Centralisé ici (et non dans le client)
-- pour rester vrai même en cas d'appel direct à l'API.
CREATE OR REPLACE FUNCTION enforce_single_primary_building_image()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE building_images
    SET is_primary = false
    WHERE building_id = NEW.building_id
      AND id <> NEW.id
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_primary_building_image ON building_images;
CREATE TRIGGER trg_single_primary_building_image
  AFTER INSERT OR UPDATE OF is_primary ON building_images
  FOR EACH ROW
  WHEN (NEW.is_primary)
  EXECUTE FUNCTION enforce_single_primary_building_image();

ALTER TABLE building_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_building_images" ON building_images;
CREATE POLICY "public_read_building_images" ON building_images FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_insert_building_images" ON building_images;
CREATE POLICY "admin_insert_building_images" ON building_images FOR INSERT TO authenticated
  WITH CHECK (is_campus_admin());

DROP POLICY IF EXISTS "admin_update_building_images" ON building_images;
CREATE POLICY "admin_update_building_images" ON building_images FOR UPDATE TO authenticated
  USING (is_campus_admin()) WITH CHECK (is_campus_admin());

DROP POLICY IF EXISTS "admin_delete_building_images" ON building_images;
CREATE POLICY "admin_delete_building_images" ON building_images FOR DELETE TO authenticated
  USING (is_campus_admin());

-- ---------------------------------------------------------------------
-- Supabase Storage : bucket public "building-images"
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'building-images',
  'building-images',
  true,
  8388608, -- 8 Mo par fichier
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

DROP POLICY IF EXISTS "public_read_building_images_objects" ON storage.objects;
CREATE POLICY "public_read_building_images_objects" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'building-images');

DROP POLICY IF EXISTS "admin_write_building_images_objects" ON storage.objects;
CREATE POLICY "admin_write_building_images_objects" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'building-images' AND is_campus_admin());

DROP POLICY IF EXISTS "admin_update_building_images_objects" ON storage.objects;
CREATE POLICY "admin_update_building_images_objects" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'building-images' AND is_campus_admin())
  WITH CHECK (bucket_id = 'building-images' AND is_campus_admin());

DROP POLICY IF EXISTS "admin_delete_building_images_objects" ON storage.objects;
CREATE POLICY "admin_delete_building_images_objects" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'building-images' AND is_campus_admin());
