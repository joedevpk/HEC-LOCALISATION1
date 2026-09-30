/*
# Correctif sécurité : auto-promotion de rôle + visibilité admin

## Problème corrigé
La policy existante `update_own_profile` (et `insert_own_profile`) autorise
un utilisateur authentifié à modifier sa propre ligne `profiles` sans
restreindre la colonne `role`. Comme `is_campus_admin()` (migration
20260826090000) se base uniquement sur cette colonne, n'importe quel compte
pouvait s'auto-promouvoir ADMIN/SUPER_ADMIN/CAMPUS_MANAGER (par ex. via un
appel direct au client Supabase depuis la console du navigateur) et ainsi
contourner toute la protection des bâtiments/salles/lieux.

Par ailleurs, les policies de lecture sur `profiles`, `bookings` et
`reports` sont strictement "own only" : un compte admin ne pouvait voir
que sa propre ligne / ses propres réservations / ses propres signalements,
ce qui rend les statistiques du tableau de bord admin et la modération des
signalements incorrectes.

Purement additif : aucune table, colonne ou policy existante n'est
supprimée. L'accès public en lecture n'est pas modifié. Le comportement
normal (un utilisateur gère son propre profil, ses propres réservations,
ses propres signalements) reste inchangé — seule l'auto-promotion de rôle
est bloquée et la visibilité admin est élargie.

## Changements
1. `is_full_admin()` : nouvelle fonction pour les actions réservées à
   ADMIN/SUPER_ADMIN uniquement (pas CAMPUS_MANAGER), en particulier la
   gestion des rôles utilisateurs — conforme à la consigne « un
   gestionnaire cartographique ne doit pas nécessairement gérer les
   utilisateurs ».
2. Trigger `trg_restrict_self_signup_role` : à l'inscription, un compte créé
   par un client authentifié ne peut prendre qu'un rôle "grand public"
   (STUDENT, TEACHER, STAFF, VISITOR). Les rôles admin ne peuvent être
   attribués que depuis le tableau Supabase / par un script d'administration
   (contexte sans JWT utilisateur), jamais depuis l'application.
3. Trigger `trg_prevent_role_self_escalation` : bloque toute modification de
   la colonne `role` d'un profil, sauf si l'auteur de la modification est
   déjà ADMIN ou SUPER_ADMIN.
4. Policy `admin_update_any_profile` : permet à un ADMIN/SUPER_ADMIN de
   modifier le profil d'un autre utilisateur (nécessaire pour une future
   interface "Gestion des utilisateurs") — le trigger ci-dessus continue de
   s'appliquer.
5. Policies `admin_select_all_profiles`, `admin_select_all_bookings`,
   `admin_select_all_reports` : les rôles ADMIN/SUPER_ADMIN/CAMPUS_MANAGER
   peuvent lire l'ensemble des profils/réservations/signalements (lecture
   seule), pour que les statistiques du tableau de bord et la modération
   des signalements reflètent tout le campus, pas seulement leur propre
   compte.
*/

-- 1. Rôle réservé aux administrateurs complets (pas les gestionnaires cartographie)
CREATE OR REPLACE FUNCTION is_full_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('ADMIN', 'SUPER_ADMIN')
  );
$$;

-- 2. À l'inscription (INSERT venant d'un client authentifié), interdire de
--    s'attribuer directement un rôle privilégié.
CREATE OR REPLACE FUNCTION restrict_self_signup_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.role NOT IN ('STUDENT', 'TEACHER', 'STAFF', 'VISITOR') THEN
    RAISE EXCEPTION 'Ce rôle ne peut pas être choisi lors de l''inscription.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_self_signup_role ON profiles;
CREATE TRIGGER trg_restrict_self_signup_role
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION restrict_self_signup_role();

-- 3. À la modification, interdire de changer la colonne role sauf si
--    l'auteur de la requête est déjà ADMIN ou SUPER_ADMIN.
CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('ADMIN', 'SUPER_ADMIN')
    ) THEN
      RAISE EXCEPTION 'Vous n''avez pas la permission de modifier ce rôle.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON profiles;
CREATE TRIGGER trg_prevent_role_self_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_self_escalation();

-- 4. Un admin complet peut modifier le profil d'un autre utilisateur
--    (le trigger ci-dessus continue de s'appliquer sur la colonne role).
DROP POLICY IF EXISTS "admin_update_any_profile" ON profiles;
CREATE POLICY "admin_update_any_profile" ON profiles FOR UPDATE TO authenticated
  USING (is_full_admin()) WITH CHECK (is_full_admin());

-- 5. Visibilité admin élargie (lecture seule) pour un tableau de bord et
--    une modération fidèles à l'ensemble du campus.
DROP POLICY IF EXISTS "admin_select_all_profiles" ON profiles;
CREATE POLICY "admin_select_all_profiles" ON profiles FOR SELECT TO authenticated
  USING (is_campus_admin());

DROP POLICY IF EXISTS "admin_select_all_bookings" ON bookings;
CREATE POLICY "admin_select_all_bookings" ON bookings FOR SELECT TO authenticated
  USING (is_campus_admin());

DROP POLICY IF EXISTS "admin_select_all_reports" ON reports;
CREATE POLICY "admin_select_all_reports" ON reports FOR SELECT TO authenticated
  USING (is_campus_admin());
