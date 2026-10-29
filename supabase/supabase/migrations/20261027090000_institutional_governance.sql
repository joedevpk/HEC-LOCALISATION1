-- ============================================================================
-- Gouvernance des données institutionnelles (passe 3) — additive, idempotente.
--
-- Aucune table, colonne ou ligne existante n'est supprimée. Rien n'est « validé »
-- automatiquement. À exécuter APRÈS sauvegarde (docs/BACKUP_RESTORE.md) et APRÈS
-- 20261026090000_data_provenance_columns.sql.
--
-- Contenu :
--  1. Colonnes photos : archivage, statut de validation, type de photo.
--  2. is_data_validator() : seuls ADMIN / SUPER_ADMIN valident (CAMPUS_MANAGER saisit et
--     modifie, mais ne valide pas). Un seul endroit à modifier si la règle change.
--  3. Garde serveur (trigger) : statut de validation, verified_at/by et coordonnées d'un
--     lieu validé ne peuvent pas être modifiés par un non-validateur, même par appel direct à l'API.
--  4. Journal d'audit append-only (audit_log), alimenté par triggers — aucun secret stocké.
--  5. RLS : le public ne lit plus les lignes archivées (côté serveur, pas seulement dans l'UI).
--  6. Stockage : chemin d'objet imposé <uuid-du-parent>/<uuid>.<ext>, parent existant.
--  7. import_campus_data() : import CSV atomique (tout ou rien), vérifié côté serveur.
--
-- Retour arrière : voir docs/GOUVERNANCE_DONNEES.md (section « Retour arrière »).
-- ============================================================================

-- ---- 1. Photos ---------------------------------------------------------------
ALTER TABLE building_images ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE building_images ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';
ALTER TABLE building_images ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE building_images ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE building_images ADD COLUMN IF NOT EXISTS photo_kind text NOT NULL DEFAULT 'other';
ALTER TABLE location_images ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE location_images ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';
ALTER TABLE location_images ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE location_images ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE location_images ADD COLUMN IF NOT EXISTS photo_kind text NOT NULL DEFAULT 'other';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'building_images_status_chk') THEN
    ALTER TABLE building_images ADD CONSTRAINT building_images_status_chk CHECK (verification_status IN ('pending','validated','archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'location_images_status_chk') THEN
    ALTER TABLE location_images ADD CONSTRAINT location_images_status_chk CHECK (verification_status IN ('pending','validated','archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'building_images_kind_chk') THEN
    ALTER TABLE building_images ADD CONSTRAINT building_images_kind_chk CHECK (photo_kind IN ('cover','exterior','entrance','interior','other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'location_images_kind_chk') THEN
    ALTER TABLE location_images ADD CONSTRAINT location_images_kind_chk CHECK (photo_kind IN ('cover','exterior','entrance','interior','other'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS building_images_archived_idx ON building_images (building_id, archived_at);
CREATE INDEX IF NOT EXISTS location_images_archived_idx ON location_images (location_id, archived_at);

-- ---- 2. Rôle « validateur » ---------------------------------------------------
CREATE OR REPLACE FUNCTION is_data_validator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role IN ('ADMIN', 'SUPER_ADMIN')
  );
$$;

-- ---- 3. Garde serveur ---------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_institutional_row()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_validator boolean;
  v_old jsonb;
  v_new jsonb;
  v_coords_changed boolean := false;
BEGIN
  -- Contexte sans utilisateur (éditeur SQL / service) : pas d'intervention ; l'audit reste journalisé.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  v_validator := is_data_validator();
  v_new := to_jsonb(NEW);

  IF TG_OP = 'INSERT' THEN
    IF NEW.verification_status = 'validated' AND NOT v_validator THEN
      RAISE EXCEPTION 'Seuls les administrateurs peuvent valider une donnée institutionnelle.' USING ERRCODE = '42501';
    END IF;
    IF NEW.verification_status = 'validated' THEN
      NEW.verified_at := now(); NEW.verified_by := auth.uid();
    ELSE
      NEW.verified_at := NULL; NEW.verified_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  IF TG_TABLE_NAME = 'buildings' THEN
    v_coords_changed := (v_old->'center_lng') IS DISTINCT FROM (v_new->'center_lng')
                     OR (v_old->'center_lat') IS DISTINCT FROM (v_new->'center_lat');
  ELSIF TG_TABLE_NAME = 'locations' THEN
    v_coords_changed := (v_old->'lng') IS DISTINCT FROM (v_new->'lng')
                     OR (v_old->'lat') IS DISTINCT FROM (v_new->'lat');
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    IF NOT v_validator THEN
      RAISE EXCEPTION 'Seuls les administrateurs peuvent changer le statut de validation.' USING ERRCODE = '42501';
    END IF;
    IF NEW.verification_status = 'validated' THEN
      NEW.verified_at := now(); NEW.verified_by := auth.uid();
    ELSE
      NEW.verified_at := NULL; NEW.verified_by := NULL;
    END IF;
  ELSE
    -- Statut inchangé : les champs de vérification ne sont jamais modifiables depuis le client.
    NEW.verified_at := OLD.verified_at; NEW.verified_by := OLD.verified_by;
  END IF;

  -- Remplacer le fichier d'une photo validée annule sa validation (la nouvelle image doit être revue).
  IF TG_TABLE_NAME IN ('building_images', 'location_images')
     AND (v_new ->> 'storage_path') IS DISTINCT FROM (v_old ->> 'storage_path')
     AND NEW.verification_status = 'validated' AND OLD.verification_status = 'validated' THEN
    NEW.verification_status := 'pending'; NEW.verified_at := NULL; NEW.verified_by := NULL;
  END IF;

  IF v_coords_changed AND OLD.verification_status = 'validated' AND NOT v_validator THEN
    RAISE EXCEPTION 'Les coordonnées d''un lieu validé ne peuvent être modifiées que par un administrateur.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_buildings ON buildings;
CREATE TRIGGER trg_guard_buildings BEFORE INSERT OR UPDATE ON buildings FOR EACH ROW EXECUTE FUNCTION guard_institutional_row();
DROP TRIGGER IF EXISTS trg_guard_locations ON locations;
CREATE TRIGGER trg_guard_locations BEFORE INSERT OR UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION guard_institutional_row();
DROP TRIGGER IF EXISTS trg_guard_building_images ON building_images;
CREATE TRIGGER trg_guard_building_images BEFORE INSERT OR UPDATE ON building_images FOR EACH ROW EXECUTE FUNCTION guard_institutional_row();
DROP TRIGGER IF EXISTS trg_guard_location_images ON location_images;
CREATE TRIGGER trg_guard_location_images BEFORE INSERT OR UPDATE ON location_images FOR EACH ROW EXECUTE FUNCTION guard_institutional_row();

-- ---- 4. Journal d'audit (append-only) ----------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  entity_label text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity_type, entity_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "validators_read_audit_log" ON audit_log;
CREATE POLICY "validators_read_audit_log" ON audit_log FOR SELECT TO authenticated USING (is_data_validator());
-- Aucune policy INSERT/UPDATE/DELETE : seul le code SECURITY DEFINER ci-dessous écrit dans la table.
REVOKE ALL ON audit_log FROM anon, authenticated;
GRANT SELECT ON audit_log TO authenticated;

CREATE OR REPLACE FUNCTION audit_write(p_action text, p_type text, p_id text, p_label text, p_details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_campus_admin() THEN
    RAISE EXCEPTION 'Journal réservé aux administrateurs.' USING ERRCODE = '42501';
  END IF;
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, entity_label, details)
  VALUES (auth.uid(), COALESCE(v_role, CASE WHEN auth.uid() IS NULL THEN 'system' ELSE NULL END),
          p_action, p_type, p_id, left(COALESCE(p_label, ''), 200),
          CASE WHEN octet_length(COALESCE(p_details, '{}'::jsonb)::text) > 4000 THEN '{"truncated":true}'::jsonb ELSE COALESCE(p_details, '{}'::jsonb) END);
END;
$$;
REVOKE EXECUTE ON FUNCTION audit_write(text, text, text, text, jsonb) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb; v_new jsonb; v_row jsonb;
  v_action text; v_changed text[]; v_changes jsonb := '{}'::jsonb; k text;
  -- Seules ces colonnes voient leur ancienne/nouvelle valeur journalisées (aucune donnée personnelle).
  v_keys text[] := ARRAY['name','code','verification_status','center_lng','center_lat','lng','lat','archived_at','is_primary','sort_order','photo_kind','caption'];
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := to_jsonb(OLD); ELSE v_row := to_jsonb(NEW); END IF;
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
    SELECT array_agg(key ORDER BY key) INTO v_changed FROM jsonb_each(v_new) WHERE v_old -> key IS DISTINCT FROM value;
    IF v_changed IS NULL THEN RETURN NEW; END IF;
    FOREACH k IN ARRAY v_keys LOOP
      IF k = ANY (v_changed) THEN
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
      END IF;
    END LOOP;
    v_action := CASE
      WHEN 'archived_at' = ANY (v_changed) AND v_new ->> 'archived_at' IS NOT NULL THEN 'archive'
      WHEN 'archived_at' = ANY (v_changed) THEN 'restore'
      WHEN 'verification_status' = ANY (v_changed) AND v_new ->> 'verification_status' = 'validated' THEN 'validate'
      WHEN 'verification_status' = ANY (v_changed) THEN 'status_change'
      WHEN ('lng' = ANY (v_changed) OR 'lat' = ANY (v_changed) OR 'center_lng' = ANY (v_changed) OR 'center_lat' = ANY (v_changed)) THEN 'move'
      WHEN 'storage_path' = ANY (v_changed) THEN 'replace_photo'
      ELSE 'update' END;
  END IF;
  PERFORM audit_write(v_action, TG_TABLE_NAME, v_row ->> 'id',
                      COALESCE(v_row ->> 'name', v_row ->> 'code', v_row ->> 'caption', ''),
                      jsonb_build_object('changed_fields', COALESCE(to_jsonb(v_changed), '[]'::jsonb), 'changes', v_changes));
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_buildings ON buildings;
CREATE TRIGGER trg_audit_buildings AFTER INSERT OR UPDATE OR DELETE ON buildings FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS trg_audit_locations ON locations;
CREATE TRIGGER trg_audit_locations AFTER INSERT OR UPDATE OR DELETE ON locations FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS trg_audit_floors ON floors;
CREATE TRIGGER trg_audit_floors AFTER INSERT OR UPDATE OR DELETE ON floors FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS trg_audit_building_images ON building_images;
CREATE TRIGGER trg_audit_building_images AFTER INSERT OR UPDATE OR DELETE ON building_images FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS trg_audit_location_images ON location_images;
CREATE TRIGGER trg_audit_location_images AFTER INSERT OR UPDATE OR DELETE ON location_images FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- ---- 5. RLS : lignes archivées invisibles du public ---------------------------
-- Les administrateurs de campus voient tout (écran « Restaurer »). Aucune donnée modifiée.
DROP POLICY IF EXISTS "public_read_buildings" ON buildings;
CREATE POLICY "public_read_buildings" ON buildings FOR SELECT TO anon, authenticated
  USING (archived_at IS NULL OR is_campus_admin());
DROP POLICY IF EXISTS "public_read_locations" ON locations;
CREATE POLICY "public_read_locations" ON locations FOR SELECT TO anon, authenticated
  USING (archived_at IS NULL OR is_campus_admin());
-- Photos : visibles seulement si non archivées ET si leur parent est lui-même visible (RLS du parent appliquée).
DROP POLICY IF EXISTS "public_read_building_images" ON building_images;
CREATE POLICY "public_read_building_images" ON building_images FOR SELECT TO anon, authenticated
  USING (is_campus_admin() OR (archived_at IS NULL AND EXISTS (SELECT 1 FROM buildings b WHERE b.id = building_images.building_id)));
DROP POLICY IF EXISTS "public_read_location_images" ON location_images;
CREATE POLICY "public_read_location_images" ON location_images FOR SELECT TO anon, authenticated
  USING (is_campus_admin() OR (archived_at IS NULL AND EXISTS (SELECT 1 FROM locations l WHERE l.id = location_images.location_id)));

-- ---- 6. Stockage : chemin imposé + parent existant ----------------------------
DROP POLICY IF EXISTS "admin_write_building_images_objects" ON storage.objects;
CREATE POLICY "admin_write_building_images_objects" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'building-images' AND is_campus_admin()
    AND storage.objects.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp|avif)$'
    AND EXISTS (SELECT 1 FROM public.buildings b WHERE b.id::text = split_part(storage.objects.name, '/', 1))
  );
DROP POLICY IF EXISTS "admin_write_location_images_objects" ON storage.objects;
CREATE POLICY "admin_write_location_images_objects" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'location-images' AND is_campus_admin()
    AND storage.objects.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp|avif)$'
    AND EXISTS (SELECT 1 FROM public.locations l WHERE l.id::text = split_part(storage.objects.name, '/', 1))
  );

-- ---- 7. Import CSV atomique ---------------------------------------------------
-- SECURITY INVOKER : les policies RLS et les triggers de garde s'appliquent à l'appelant.
-- Toute ligne invalide ou doublon lève une exception → la transaction entière est annulée.
CREATE OR REPLACE FUNCTION import_campus_data(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_campus uuid;
  b jsonb; r jsonb;
  v_bid uuid; v_fid uuid; v_lvl int;
  v_nb int := 0; v_nr int := 0; v_nf int := 0;
  v_lng double precision; v_lat double precision;
BEGIN
  IF NOT is_campus_admin() THEN
    RAISE EXCEPTION 'Import réservé aux administrateurs.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'Charge utile invalide.'; END IF;
  v_campus := (p_payload ->> 'campus_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM campuses WHERE id = v_campus) THEN RAISE EXCEPTION 'Campus introuvable.'; END IF;
  IF jsonb_array_length(COALESCE(p_payload -> 'buildings', '[]')) > 500 OR jsonb_array_length(COALESCE(p_payload -> 'rooms', '[]')) > 2000 THEN
    RAISE EXCEPTION 'Fichier trop volumineux (500 bâtiments / 2000 salles maximum).';
  END IF;

  FOR b IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'buildings', '[]')) LOOP
    v_lng := (b ->> 'lng')::double precision; v_lat := (b ->> 'lat')::double precision;
    IF COALESCE(btrim(b ->> 'name'), '') = '' OR COALESCE(btrim(b ->> 'code'), '') = '' THEN
      RAISE EXCEPTION 'Bâtiment sans nom ou sans code.';
    END IF;
    IF v_lng IS NULL OR v_lat IS NULL OR v_lng NOT BETWEEN -180 AND 180 OR v_lat NOT BETWEEN -90 AND 90 OR (abs(v_lng) < 1e-6 AND abs(v_lat) < 1e-6) THEN
      RAISE EXCEPTION 'Coordonnées invalides pour le bâtiment %.', b ->> 'code';
    END IF;
    IF EXISTS (SELECT 1 FROM buildings WHERE campus_id = v_campus AND archived_at IS NULL AND lower(code) = lower(btrim(b ->> 'code'))) THEN
      RAISE EXCEPTION 'Doublon : le bâtiment % existe déjà.', b ->> 'code';
    END IF;
    INSERT INTO buildings (campus_id, name, code, description, category, center_lng, center_lat, floor_count, data_source, verification_status, location_accuracy)
    VALUES (v_campus, btrim(b ->> 'name'), btrim(b ->> 'code'), COALESCE(b ->> 'description', ''), COALESCE(NULLIF(b ->> 'category', ''), 'academic'),
            v_lng, v_lat, COALESCE((b ->> 'floor_count')::int, 1), 'import_csv', 'pending', NULLIF(b ->> 'location_accuracy', '')::numeric);
    v_nb := v_nb + 1;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'rooms', '[]')) LOOP
    v_lng := (r ->> 'lng')::double precision; v_lat := (r ->> 'lat')::double precision;
    IF COALESCE(btrim(r ->> 'name'), '') = '' THEN RAISE EXCEPTION 'Salle sans nom.'; END IF;
    IF v_lng IS NULL OR v_lat IS NULL OR v_lng NOT BETWEEN -180 AND 180 OR v_lat NOT BETWEEN -90 AND 90 OR (abs(v_lng) < 1e-6 AND abs(v_lat) < 1e-6) THEN
      RAISE EXCEPTION 'Coordonnées invalides pour la salle %.', r ->> 'name';
    END IF;
    SELECT id INTO v_bid FROM buildings WHERE campus_id = v_campus AND archived_at IS NULL AND lower(code) = lower(btrim(r ->> 'building_code')) LIMIT 1;
    IF v_bid IS NULL THEN RAISE EXCEPTION 'Bâtiment introuvable pour la salle % (code %).', r ->> 'name', r ->> 'building_code'; END IF;
    IF EXISTS (SELECT 1 FROM locations WHERE building_id = v_bid AND archived_at IS NULL AND code <> '' AND lower(code) = lower(btrim(COALESCE(r ->> 'code', '')))) THEN
      RAISE EXCEPTION 'Doublon : la salle % existe déjà dans le bâtiment %.', r ->> 'code', r ->> 'building_code';
    END IF;
    v_fid := NULL;
    IF NULLIF(r ->> 'floor_level', '') IS NOT NULL THEN
      v_lvl := (r ->> 'floor_level')::int;
      SELECT id INTO v_fid FROM floors WHERE building_id = v_bid AND level = v_lvl LIMIT 1;
      IF v_fid IS NULL THEN
        INSERT INTO floors (building_id, level, name, sort_order) VALUES (v_bid, v_lvl, COALESCE(NULLIF(btrim(r ->> 'floor_name'), ''), 'Niveau ' || v_lvl), v_lvl) RETURNING id INTO v_fid;
        v_nf := v_nf + 1;
      END IF;
    END IF;
    INSERT INTO locations (building_id, floor_id, name, code, kind, category, description, capacity, lng, lat, is_accessible, data_source, verification_status)
    VALUES (v_bid, v_fid, btrim(r ->> 'name'), btrim(COALESCE(r ->> 'code', '')), COALESCE(NULLIF(r ->> 'kind', ''), 'room'), 'general',
            COALESCE(r ->> 'description', ''), NULLIF(r ->> 'capacity', '')::int, v_lng, v_lat, COALESCE((r ->> 'is_accessible')::boolean, true), 'import_csv', 'pending');
    v_nr := v_nr + 1;
  END LOOP;

  PERFORM audit_write('import', 'campus_data', v_campus::text, 'Import CSV',
                      jsonb_build_object('buildings_created', v_nb, 'rooms_created', v_nr, 'floors_created', v_nf));
  RETURN jsonb_build_object('buildings_created', v_nb, 'rooms_created', v_nr, 'floors_created', v_nf);
END;
$$;
REVOKE EXECUTE ON FUNCTION import_campus_data(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION import_campus_data(jsonb) TO authenticated;
