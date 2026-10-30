-- Tests de permissions (RLS, triggers de garde, journal d'audit, import, stockage).
-- À exécuter sur une base de TEST (jamais en production) après les migrations. Tout est annulé (ROLLBACK).
-- Sortie : une ligne PASS/FAIL par contrôle, puis un bilan ; échec = code de sortie ≠ 0.
\set ON_ERROR_STOP on
BEGIN;
\o /dev/null
CREATE SCHEMA t;
CREATE TABLE t.results (label text, pass boolean, detail text);

-- exécute `sql` sous le rôle `rolname` avec le sub JWT `uid`; renvoie (erreur, lignes touchées)
CREATE FUNCTION t.run_as(uid uuid, rolname text, sql text, OUT err text, OUT n bigint) LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(uid::text, ''), true);
  EXECUTE format('SET LOCAL ROLE %I', rolname);
  BEGIN
    EXECUTE sql;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    err := SQLERRM; n := 0;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
CREATE FUNCTION t.count_as(uid uuid, rolname text, q text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE c bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(uid::text, ''), true);
  EXECUTE format('SET LOCAL ROLE %I', rolname);
  EXECUTE 'SELECT count(*) FROM (' || q || ') s' INTO c;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN c;
END $$;
CREATE FUNCTION t.ok(label text, cond boolean, detail text DEFAULT '') RETURNS void LANGUAGE sql AS $$
  INSERT INTO t.results VALUES (label, COALESCE(cond, false), detail) $$;
-- DML autorisé : aucune erreur ET au moins une ligne affectée
CREATE FUNCTION t.allowed(label text, uid uuid, rolname text, sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN SELECT * INTO r FROM t.run_as(uid, rolname, sql); PERFORM t.ok(label, r.err IS NULL AND r.n > 0, COALESCE(r.err, 'lignes=' || r.n)); END $$;
-- DML refusé : exception OU aucune ligne affectée (RLS)
CREATE FUNCTION t.denied(label text, uid uuid, rolname text, sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN SELECT * INTO r FROM t.run_as(uid, rolname, sql); PERFORM t.ok(label, r.err IS NOT NULL OR r.n = 0, COALESCE(r.err, 'lignes=' || r.n)); END $$;

-- ---------- Jeu de données de test (superutilisateur) ----------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'student@test'), ('00000000-0000-4000-8000-0000000000a2', 'manager@test'),
  ('00000000-0000-4000-8000-0000000000a3', 'admin@test');
INSERT INTO profiles (id, full_name, role) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Étudiant', 'STUDENT'),
  ('00000000-0000-4000-8000-0000000000a2', 'Gestionnaire', 'CAMPUS_MANAGER'),
  ('00000000-0000-4000-8000-0000000000a3', 'Admin', 'ADMIN');
INSERT INTO campuses (id, name) VALUES ('00000000-0000-4000-8000-0000000000c1', 'Campus test');
INSERT INTO buildings (id, campus_id, name, code, center_lng, center_lat, archived_at, verification_status) VALUES
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000c1', 'B1 en attente', 'B1', 15.30, -4.30, NULL, 'pending'),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-0000000000c1', 'B2 archivé', 'B2', 15.31, -4.31, now(), 'pending'),
  ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-0000000000c1', 'B3 validé', 'B3', 15.32, -4.32, NULL, 'validated');
INSERT INTO locations (id, building_id, name, code, lng, lat, archived_at) VALUES
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000b001', 'Salle A', 'A1', 15.30, -4.30, NULL),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000b001', 'Salle archivée', 'A2', 15.30, -4.30, now());
INSERT INTO building_images (id, building_id, storage_path, public_url, archived_at) VALUES
  ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-00000000b001', 'p1', 'u1', NULL),
  ('00000000-0000-4000-8000-0000000a0002', '00000000-0000-4000-8000-00000000b001', 'p2', 'u2', now()),
  ('00000000-0000-4000-8000-0000000a0003', '00000000-0000-4000-8000-00000000b002', 'p3', 'u3', NULL);

\set student '''00000000-0000-4000-8000-0000000000a1'''
\set manager '''00000000-0000-4000-8000-0000000000a2'''
\set admin   '''00000000-0000-4000-8000-0000000000a3'''

-- ---------- Lecture publique ----------
SELECT t.ok('anon ne lit pas les bâtiments archivés', t.count_as(NULL, 'anon', $$SELECT 1 FROM buildings WHERE campus_id='00000000-0000-4000-8000-0000000000c1'$$) = 2);
SELECT t.ok('anon ne lit pas les salles archivées', t.count_as(NULL, 'anon', $$SELECT 1 FROM locations WHERE building_id='00000000-0000-4000-8000-00000000b001'$$) = 1);
SELECT t.ok('anon ne lit que les photos non archivées d''un bâtiment visible', t.count_as(NULL, 'anon', $$SELECT 1 FROM building_images WHERE storage_path IN ('p1','p2','p3')$$) = 1);
SELECT t.ok('un gestionnaire voit les bâtiments archivés (écran Restaurer)', t.count_as(:manager, 'authenticated', $$SELECT 1 FROM buildings WHERE campus_id='00000000-0000-4000-8000-0000000000c1'$$) = 3);
-- ---------- Écriture : utilisateurs ordinaires ----------
SELECT t.denied('anon ne peut pas créer un bâtiment', NULL, 'anon', $$INSERT INTO buildings (campus_id,name,code,center_lng,center_lat) VALUES ('00000000-0000-4000-8000-0000000000c1','X','X',15.3,-4.3)$$);
SELECT t.denied('étudiant ne peut pas créer un bâtiment', :student, 'authenticated', $$INSERT INTO buildings (campus_id,name,code,center_lng,center_lat) VALUES ('00000000-0000-4000-8000-0000000000c1','X','X',15.3,-4.3)$$);
SELECT t.denied('étudiant ne peut pas modifier un bâtiment', :student, 'authenticated', $$UPDATE buildings SET name='piraté' WHERE code='B1'$$);
SELECT t.denied('étudiant ne peut pas modifier les coordonnées d''une salle', :student, 'authenticated', $$UPDATE locations SET lng=1 WHERE code='A1'$$);
SELECT t.denied('étudiant ne peut pas supprimer un bâtiment', :student, 'authenticated', $$DELETE FROM buildings WHERE code='B1'$$);
SELECT t.denied('étudiant ne peut pas ajouter de photo', :student, 'authenticated', $$INSERT INTO building_images (building_id,storage_path,public_url) VALUES ('00000000-0000-4000-8000-00000000b001','z','z')$$);
SELECT t.denied('étudiant ne peut pas s''attribuer le rôle ADMIN', :student, 'authenticated', $$UPDATE profiles SET role='ADMIN' WHERE id='00000000-0000-4000-8000-0000000000a1'$$);
SELECT t.denied('étudiant ne peut pas appeler l''import', :student, 'authenticated', $$SELECT import_campus_data('{"campus_id":"00000000-0000-4000-8000-0000000000c1","buildings":[]}'::jsonb)$$);
-- ---------- Gestionnaire : saisie oui, validation non ----------
SELECT t.allowed('gestionnaire peut créer un bâtiment (en attente)', :manager, 'authenticated', $$INSERT INTO buildings (campus_id,name,code,center_lng,center_lat) VALUES ('00000000-0000-4000-8000-0000000000c1','B4','B4',15.33,-4.33)$$);
SELECT t.denied('gestionnaire ne peut pas créer un bâtiment déjà « validé »', :manager, 'authenticated', $$INSERT INTO buildings (campus_id,name,code,center_lng,center_lat,verification_status) VALUES ('00000000-0000-4000-8000-0000000000c1','B5','B5',15.3,-4.3,'validated')$$);
SELECT t.denied('gestionnaire ne peut pas valider un bâtiment', :manager, 'authenticated', $$UPDATE buildings SET verification_status='validated' WHERE code='B1'$$);
SELECT t.denied('gestionnaire ne peut pas déplacer un bâtiment validé', :manager, 'authenticated', $$UPDATE buildings SET center_lng=16 WHERE code='B3'$$);
SELECT t.allowed('gestionnaire peut corriger le nom d''un bâtiment validé', :manager, 'authenticated', $$UPDATE buildings SET description='texte' WHERE code='B3'$$);
SELECT t.allowed('gestionnaire peut déplacer un bâtiment non validé', :manager, 'authenticated', $$UPDATE buildings SET center_lng=15.301 WHERE code='B1'$$);
SELECT t.run_as(:manager::uuid, 'authenticated', $$UPDATE buildings SET verified_by='00000000-0000-4000-8000-0000000000a2', verified_at=now() WHERE code='B1'$$);
SELECT t.ok('verified_by / verified_at ne sont pas falsifiables par le client', (SELECT verified_by IS NULL AND verified_at IS NULL FROM buildings WHERE code='B1'));
SELECT t.allowed('gestionnaire peut archiver une salle', :manager, 'authenticated', $$UPDATE locations SET archived_at=now() WHERE code='A1'$$);
SELECT t.allowed('gestionnaire peut ajouter une photo', :manager, 'authenticated', $$INSERT INTO building_images (building_id,storage_path,public_url) VALUES ('00000000-0000-4000-8000-00000000b001','m1','m1')$$);
SELECT t.denied('gestionnaire ne peut pas valider une photo', :manager, 'authenticated', $$UPDATE building_images SET verification_status='validated' WHERE storage_path='m1'$$);
-- ---------- Administrateur ----------
SELECT t.allowed('admin valide un bâtiment', :admin, 'authenticated', $$UPDATE buildings SET verification_status='validated' WHERE code='B1'$$);
SELECT t.ok('la validation enregistre le validateur et la date côté serveur', (SELECT verified_by = '00000000-0000-4000-8000-0000000000a3' AND verified_at IS NOT NULL FROM buildings WHERE code='B1'));
SELECT t.allowed('admin peut déplacer un bâtiment validé', :admin, 'authenticated', $$UPDATE buildings SET center_lng=15.302 WHERE code='B1'$$);
SELECT t.allowed('admin valide une photo', :admin, 'authenticated', $$UPDATE building_images SET verification_status='validated' WHERE storage_path='m1'$$);
SELECT t.allowed('admin remplace le fichier d''une photo validée', :admin, 'authenticated', $$UPDATE building_images SET storage_path='m1-bis' WHERE storage_path='m1'$$);
SELECT t.ok('remplacer une photo validée annule sa validation', (SELECT verification_status='pending' AND verified_by IS NULL FROM building_images WHERE storage_path='m1-bis'));
SELECT t.allowed('admin retire la validation', :admin, 'authenticated', $$UPDATE buildings SET verification_status='pending' WHERE code='B1'$$);
SELECT t.ok('retirer la validation efface le validateur', (SELECT verified_by IS NULL FROM buildings WHERE code='B1'));
-- ---------- Journal d'audit ----------
SELECT t.ok('l''admin lit le journal d''audit', t.count_as(:admin, 'authenticated', 'SELECT 1 FROM audit_log') > 0);
SELECT t.ok('le gestionnaire ne lit pas le journal', t.count_as(:manager, 'authenticated', 'SELECT 1 FROM audit_log') = 0);
SELECT t.ok('l''étudiant ne lit pas le journal', t.count_as(:student, 'authenticated', 'SELECT 1 FROM audit_log') = 0);
SELECT t.denied('anon ne lit pas le journal (privilège retiré)', NULL, 'anon', 'SELECT * FROM audit_log');
SELECT t.ok('journal : la validation est tracée avec l''acteur', EXISTS (SELECT 1 FROM audit_log WHERE action='validate' AND entity_type='buildings' AND actor_id='00000000-0000-4000-8000-0000000000a3' AND actor_role='ADMIN'));
SELECT t.ok('journal : l''archivage est tracé', EXISTS (SELECT 1 FROM audit_log WHERE action='archive' AND entity_type='locations'));
SELECT t.ok('journal : le déplacement est tracé avec ancienne/nouvelle valeur', EXISTS (SELECT 1 FROM audit_log WHERE action='move' AND details->'changes'->'center_lng' ? 'from'));
SELECT t.denied('le journal ne peut pas être modifié par un admin', :admin, 'authenticated', $$UPDATE audit_log SET action='x'$$);
SELECT t.denied('le journal ne peut pas être supprimé par un admin', :admin, 'authenticated', $$DELETE FROM audit_log$$);
SELECT t.denied('le journal ne peut pas être écrit directement', :admin, 'authenticated', $$INSERT INTO audit_log (action,entity_type) VALUES ('x','y')$$);
SELECT t.denied('audit_write est inaccessible à un utilisateur ordinaire', :student, 'authenticated', $$SELECT audit_write('x','y','1','l','{}'::jsonb)$$);
SELECT t.ok('le journal ne contient aucun secret (colonnes autorisées uniquement)', NOT EXISTS (SELECT 1 FROM audit_log, jsonb_object_keys(details->'changes') k WHERE entity_type <> 'profiles' AND k NOT IN ('name','code','verification_status','center_lng','center_lat','lng','lat','archived_at','is_primary','sort_order','photo_kind','caption')));
-- ---------- Import atomique ----------
SELECT t.allowed('import valide par un gestionnaire', :manager, 'authenticated', $$SELECT import_campus_data('{"campus_id":"00000000-0000-4000-8000-0000000000c1","buildings":[{"code":"N1","name":"Nouveau","lng":15.34,"lat":-4.34}],"rooms":[{"building_code":"N1","floor_level":1,"code":"101","name":"Salle 101","lng":15.34,"lat":-4.34}]}'::jsonb)$$);
SELECT t.ok('import : bâtiment et salle créés EN ATTENTE avec source import_csv', (SELECT count(*) = 1 FROM locations l JOIN buildings b ON b.id=l.building_id WHERE b.code='N1' AND l.verification_status='pending' AND l.data_source='import_csv' AND b.verification_status='pending'));
SELECT t.ok('import : l''étage est créé', EXISTS (SELECT 1 FROM floors f JOIN buildings b ON b.id=f.building_id WHERE b.code='N1' AND f.level=1));
SELECT t.ok('import : tracé dans le journal', EXISTS (SELECT 1 FROM audit_log WHERE action='import'));
SELECT t.denied('import avec doublon : refusé', :manager, 'authenticated', $$SELECT import_campus_data('{"campus_id":"00000000-0000-4000-8000-0000000000c1","buildings":[{"code":"NEUF","name":"Valide","lng":15.4,"lat":-4.4},{"code":"b1","name":"Doublon","lng":15.4,"lat":-4.4}]}'::jsonb)$$);
SELECT t.ok('import avec doublon : RIEN n''est écrit (atomique)', NOT EXISTS (SELECT 1 FROM buildings WHERE code='NEUF'));
SELECT t.denied('import avec coordonnées (0,0) refusé', :manager, 'authenticated', $$SELECT import_campus_data('{"campus_id":"00000000-0000-4000-8000-0000000000c1","buildings":[{"code":"Z0","name":"Zéro","lng":0,"lat":0}]}'::jsonb)$$);
SELECT t.denied('import avec latitude hors plage refusé', :manager, 'authenticated', $$SELECT import_campus_data('{"campus_id":"00000000-0000-4000-8000-0000000000c1","buildings":[{"code":"Z1","name":"Hors","lng":15,"lat":95}]}'::jsonb)$$);
SELECT t.denied('import d''une salle vers un bâtiment inconnu refusé', :manager, 'authenticated', $$SELECT import_campus_data('{"campus_id":"00000000-0000-4000-8000-0000000000c1","rooms":[{"building_code":"INCONNU","name":"S","lng":15.3,"lat":-4.3}]}'::jsonb)$$);
SELECT t.ok('aucune ligne partielle après imports refusés', NOT EXISTS (SELECT 1 FROM buildings WHERE code IN ('Z0','Z1','NEUF')));
-- ---------- Hiérarchie des rôles (passe 4) ----------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000000a4', 'super@test'), ('00000000-0000-4000-8000-0000000000a5', 'admin2@test'),
  ('00000000-0000-4000-8000-0000000000a6', 'cible@test');
INSERT INTO profiles (id, full_name, role) VALUES
  ('00000000-0000-4000-8000-0000000000a4', 'Super', 'SUPER_ADMIN'),
  ('00000000-0000-4000-8000-0000000000a5', 'Admin Deux', 'ADMIN'),
  ('00000000-0000-4000-8000-0000000000a6', 'Cible Etudiante', 'STUDENT');
\set super '''00000000-0000-4000-8000-0000000000a4'''
SELECT t.denied('admin ne peut pas s''attribuer SUPER_ADMIN', :admin, 'authenticated', $$UPDATE profiles SET role='SUPER_ADMIN' WHERE id='00000000-0000-4000-8000-0000000000a3'$$);
SELECT t.denied('admin ne peut pas promouvoir un tiers SUPER_ADMIN', :admin, 'authenticated', $$UPDATE profiles SET role='SUPER_ADMIN' WHERE id='00000000-0000-4000-8000-0000000000a6'$$);
SELECT t.denied('admin ne peut pas rétrograder un SUPER_ADMIN', :admin, 'authenticated', $$UPDATE profiles SET role='STUDENT' WHERE id='00000000-0000-4000-8000-0000000000a4'$$);
SELECT t.denied('admin ne peut pas modifier son propre rôle', :admin, 'authenticated', $$UPDATE profiles SET role='CAMPUS_MANAGER' WHERE id='00000000-0000-4000-8000-0000000000a3'$$);
SELECT t.denied('super-admin ne peut pas modifier son propre rôle', :super, 'authenticated', $$UPDATE profiles SET role='ADMIN' WHERE id='00000000-0000-4000-8000-0000000000a4'$$);
SELECT t.denied('gestionnaire ne peut pas promouvoir un compte', :manager, 'authenticated', $$UPDATE profiles SET role='CAMPUS_MANAGER' WHERE id='00000000-0000-4000-8000-0000000000a6'$$);
SELECT t.denied('étudiant ne peut pas s''attribuer ADMIN (INSERT direct refusé aussi)', :student, 'authenticated', $$INSERT INTO profiles (id, full_name, role) VALUES ('00000000-0000-4000-8000-0000000000a7','x','ADMIN')$$);
SELECT t.allowed('admin peut nommer un gestionnaire (cas légitime conservé)', :admin, 'authenticated', $$UPDATE profiles SET role='CAMPUS_MANAGER' WHERE id='00000000-0000-4000-8000-0000000000a6'$$);
SELECT t.allowed('super-admin peut nommer un ADMIN', :super, 'authenticated', $$UPDATE profiles SET role='ADMIN' WHERE id='00000000-0000-4000-8000-0000000000a6'$$);
SELECT t.allowed('super-admin peut attribuer SUPER_ADMIN à un tiers', :super, 'authenticated', $$UPDATE profiles SET role='SUPER_ADMIN' WHERE id='00000000-0000-4000-8000-0000000000a6'$$);
SELECT t.allowed('un utilisateur modifie toujours son nom sans toucher au rôle', :student, 'authenticated', $$UPDATE profiles SET full_name='Nouveau nom' WHERE id='00000000-0000-4000-8000-0000000000a1'$$);
SELECT t.ok('les tentatives refusées n''ont pas changé les rôles', (SELECT role FROM profiles WHERE id='00000000-0000-4000-8000-0000000000a3')='ADMIN' AND (SELECT role FROM profiles WHERE id='00000000-0000-4000-8000-0000000000a4')='SUPER_ADMIN');
SELECT t.ok('journal : un changement de rôle est tracé avec acteur, ancien et nouveau rôle', EXISTS (SELECT 1 FROM audit_log WHERE action='role_change' AND entity_type='profiles' AND actor_id='00000000-0000-4000-8000-0000000000a3' AND details->'changes'->'role'->>'from'='STUDENT' AND details->'changes'->'role'->>'to'='CAMPUS_MANAGER'));
SELECT t.ok('journal des rôles : aucun nom ni e-mail (identifiant et rôles uniquement)', NOT EXISTS (SELECT 1 FROM audit_log WHERE entity_type='profiles' AND (entity_label <> '' OR details::text ~* '(@|Cible|Admin Deux|Etudiante)')));
SELECT t.ok('journal des rôles : seule la clé « role » est consignée', NOT EXISTS (SELECT 1 FROM audit_log, jsonb_object_keys(details->'changes') k WHERE entity_type='profiles' AND k <> 'role'));
-- Contexte sans JWT (SQL Editor / service_role) : voie d'administration conservée, et tracée « system ».
UPDATE profiles SET role='STUDENT' WHERE id='00000000-0000-4000-8000-0000000000a6';
SELECT t.ok('SQL Editor / service_role : changement de rôle toujours possible', (SELECT role FROM profiles WHERE id='00000000-0000-4000-8000-0000000000a6')='STUDENT');
SELECT t.ok('SQL Editor : le changement est tracé avec l''acteur « system »', EXISTS (SELECT 1 FROM audit_log WHERE action='role_change' AND actor_role='system' AND details->'changes'->'role'->>'to'='STUDENT'));

-- ---------- Stockage ----------
INSERT INTO storage.buckets (id, name, public) VALUES ('building-images','building-images',true) ON CONFLICT (id) DO NOTHING;
SELECT t.allowed('gestionnaire : dépôt d''une photo au bon chemin', :manager, 'authenticated', $$INSERT INTO storage.objects (bucket_id,name) VALUES ('building-images','00000000-0000-4000-8000-00000000b001/11111111-1111-4111-8111-111111111111.webp')$$);
SELECT t.denied('gestionnaire : chemin hors modèle refusé', :manager, 'authenticated', $$INSERT INTO storage.objects (bucket_id,name) VALUES ('building-images','nimporte/quoi.exe')$$);
SELECT t.denied('gestionnaire : extension non image refusée', :manager, 'authenticated', $$INSERT INTO storage.objects (bucket_id,name) VALUES ('building-images','00000000-0000-4000-8000-00000000b001/11111111-1111-4111-8111-111111111112.svg')$$);
SELECT t.denied('gestionnaire : bâtiment parent inexistant refusé', :manager, 'authenticated', $$INSERT INTO storage.objects (bucket_id,name) VALUES ('building-images','99999999-9999-4999-8999-999999999999/11111111-1111-4111-8111-111111111113.webp')$$);
SELECT t.denied('étudiant : dépôt refusé', :student, 'authenticated', $$INSERT INTO storage.objects (bucket_id,name) VALUES ('building-images','00000000-0000-4000-8000-00000000b001/11111111-1111-4111-8111-111111111114.webp')$$);
SELECT t.denied('anon : dépôt refusé', NULL, 'anon', $$INSERT INTO storage.objects (bucket_id,name) VALUES ('building-images','00000000-0000-4000-8000-00000000b001/11111111-1111-4111-8111-111111111115.webp')$$);
SELECT t.denied('étudiant : suppression d''un fichier refusée', :student, 'authenticated', $$DELETE FROM storage.objects WHERE bucket_id='building-images'$$);
SELECT t.ok('lecture publique des fichiers', t.count_as(NULL, 'anon', $$SELECT 1 FROM storage.objects WHERE bucket_id='building-images'$$) >= 1);

\o
SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS statut, label, detail FROM t.results ORDER BY pass, label;
SELECT count(*) FILTER (WHERE pass) AS reussis, count(*) FILTER (WHERE NOT pass) AS echecs FROM t.results;
ROLLBACK;
