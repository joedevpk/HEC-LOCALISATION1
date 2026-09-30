-- ============================================================
-- Donnée d'exemple (démo/pédagogique) : un bâtiment complet avec son
-- entrée + une salle, pour visualiser concrètement comment la
-- localisation (lng/lat), la hiérarchie bâtiment > étage > salle, et
-- l'entrée d'un bâtiment s'articulent dans la base.
--
-- Volontairement SÉPARÉE des autres migrations (celles-ci définissent
-- le schéma, celle-ci ne fait qu'insérer des données d'exemple) :
-- - à exécuter une seule fois APRÈS avoir créé votre campus depuis
--   l'application (elle échoue proprement si aucun campus n'existe) ;
-- - à supprimer/ignorer sans risque plus tard, ou à archiver depuis
--   l'admin (bouton "Archiver") une fois que vous avez vos vrais
--   bâtiments — voir la fin de ce fichier pour la commande de retrait.
--
-- Ré-exécutable sans risque (IDs fixes + ON CONFLICT DO UPDATE) : si
-- vous relancez ce script, il met juste à jour les mêmes lignes au
-- lieu d'en créer des doublons.
--
-- Positionnement : les coordonnées sont calculées à partir du VRAI
-- centre de votre campus (table `campuses`), avec un petit décalage en
-- degrés équivalant à quelques dizaines de mètres — donc toujours
-- cohérentes avec votre campus réel, où qu'il se trouve dans le monde.
-- Ce ne sont PAS les coordonnées exactes d'un vrai bâtiment : à
-- corriger depuis l'admin (clic sur la carte) une fois en conditions
-- réelles.
-- ============================================================

DO $$
DECLARE
  v_campus_id   uuid;
  v_campus_lng  double precision;
  v_campus_lat  double precision;
  -- IDs fixes (et non aléatoires) : relancer ce script met à jour les
  -- mêmes lignes au lieu d'en créer de nouvelles à chaque fois.
  v_building_id uuid := '00000000-0000-4000-a000-000000000b01';
  v_floor_id    uuid := '00000000-0000-4000-a000-000000000f01';
  v_entrance_id uuid := '00000000-0000-4000-a000-000000000e01';
  v_room_id     uuid := '00000000-0000-4000-a000-000000000101';
BEGIN
  SELECT id, center_lng, center_lat
    INTO v_campus_id, v_campus_lng, v_campus_lat
  FROM campuses
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_campus_id IS NULL THEN
    RAISE EXCEPTION
      'Aucun campus trouvé : créez d''abord votre campus depuis l''application (ou la table campuses) avant d''exécuter cette migration d''exemple.';
  END IF;

  -- ----------------------------------------------------------------
  -- 1) Le bâtiment : "Bâtiment Informatique"
  --    center_lng/center_lat = le point utilisé pour le marqueur du
  --    bâtiment sur la carte (pas forcément l'entrée, voir plus bas).
  -- ----------------------------------------------------------------
  INSERT INTO buildings (
    id, campus_id, name, code, description, category, color,
    center_lng, center_lat, floor_count
  ) VALUES (
    v_building_id,
    v_campus_id,
    'Bâtiment Informatique',
    'INFO',
    'Exemple de remplissage — bâtiment abritant les laboratoires informatiques et salles réseau. À modifier ou remplacer par vos vrais bâtiments depuis l''admin.',
    'academic',
    '#2563eb',
    v_campus_lng + 0.00035,  -- ≈ 35-40 m à l'est du centre du campus
    v_campus_lat + 0.00010,  -- ≈ 10-12 m au nord
    2
  )
  ON CONFLICT (id) DO UPDATE SET
    campus_id    = EXCLUDED.campus_id,
    name         = EXCLUDED.name,
    code         = EXCLUDED.code,
    description  = EXCLUDED.description,
    category     = EXCLUDED.category,
    color        = EXCLUDED.color,
    center_lng   = EXCLUDED.center_lng,
    center_lat   = EXCLUDED.center_lat,
    floor_count  = EXCLUDED.floor_count;

  -- ----------------------------------------------------------------
  -- 2) Un étage, pour montrer le lien salle -> étage -> bâtiment.
  -- ----------------------------------------------------------------
  INSERT INTO floors (id, building_id, level, name, sort_order)
  VALUES (v_floor_id, v_building_id, 1, '1er étage', 1)
  ON CONFLICT (id) DO UPDATE SET
    building_id = EXCLUDED.building_id,
    level       = EXCLUDED.level,
    name        = EXCLUDED.name,
    sort_order  = EXCLUDED.sort_order;

  -- ----------------------------------------------------------------
  -- 3) L'entrée du bâtiment : un lieu à part (kind='entrance'), utilisé
  --    par le guidage extérieur comme point d'arrivée réel (ÉTAPE 14 du
  --    cahier des charges) — jamais le centre géométrique du bâtiment,
  --    qui n'est pas forcément accessible à pied.
  -- ----------------------------------------------------------------
  INSERT INTO locations (
    id, building_id, floor_id, name, code, kind, category,
    description, capacity, lng, lat, is_accessible
  ) VALUES (
    v_entrance_id,
    v_building_id,
    NULL,
    'Entrée — Bâtiment Informatique',
    'INFO-ENTREE',
    'entrance',
    'entrance',
    'Entrée principale, côté avenue.',
    NULL,
    v_campus_lng + 0.00033,
    v_campus_lat + 0.00006,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    building_id  = EXCLUDED.building_id,
    floor_id     = EXCLUDED.floor_id,
    name         = EXCLUDED.name,
    code         = EXCLUDED.code,
    kind         = EXCLUDED.kind,
    category     = EXCLUDED.category,
    description  = EXCLUDED.description,
    capacity     = EXCLUDED.capacity,
    lng          = EXCLUDED.lng,
    lat          = EXCLUDED.lat,
    is_accessible = EXCLUDED.is_accessible;

  -- ----------------------------------------------------------------
  -- 4) La salle : "Salle Jumelle 1" (kind='room', category='lab') —
  --    salle informatique, positionnée à l'intérieur du bâtiment,
  --    reliée à l'étage créé ci-dessus.
  -- ----------------------------------------------------------------
  INSERT INTO locations (
    id, building_id, floor_id, name, code, kind, category,
    description, capacity, lng, lat, is_accessible
  ) VALUES (
    v_room_id,
    v_building_id,
    v_floor_id,
    'Salle Jumelle 1',
    'INFO-101',
    'room',
    'lab',
    'Exemple de remplissage — salle informatique équipée de postes en réseau, jumelle de la "Salle Jumelle 2" située en face (à créer de la même façon si besoin).',
    24,
    v_campus_lng + 0.00036,
    v_campus_lat + 0.00012,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    building_id  = EXCLUDED.building_id,
    floor_id     = EXCLUDED.floor_id,
    name         = EXCLUDED.name,
    code         = EXCLUDED.code,
    kind         = EXCLUDED.kind,
    category     = EXCLUDED.category,
    description  = EXCLUDED.description,
    capacity     = EXCLUDED.capacity,
    lng          = EXCLUDED.lng,
    lat          = EXCLUDED.lat,
    is_accessible = EXCLUDED.is_accessible;

  RAISE NOTICE 'Exemple inséré : bâtiment "%", étage "%", entrée "%", salle "%".',
    v_building_id, v_floor_id, v_entrance_id, v_room_id;
END $$;

-- ============================================================
-- Pour retirer cet exemple plus tard (une fois vos vraies données
-- saisies), deux options :
--
-- Option A (recommandée) — depuis l'application : ouvrez l'admin,
-- section Bâtiments, et cliquez "Archiver" sur "Bâtiment Informatique"
-- (réversible, masque aussi ses salles).
--
-- Option B — suppression définitive en SQL (irréversible) :
--   DELETE FROM buildings WHERE id = '00000000-0000-4000-a000-000000000b01';
--   -- (les floors et locations liés sont supprimés automatiquement par
--   --  les contraintes ON DELETE CASCADE / SET NULL du schéma)
-- ============================================================
