-- ============================================================================
-- Passe 4 — Garde de hiérarchie des rôles + journalisation des changements de rôle.
-- Additive et idempotente : aucune table, colonne, policy ni ligne n'est supprimée.
--
-- Défaut corrigé (démontré sur PostgreSQL local avant correctif) :
--   le trigger prevent_role_self_escalation() laissait n'importe quel ADMIN écrire
--   n'importe quel rôle, y compris SUPER_ADMIN, pour lui-même ou pour un tiers, par
--   simple appel direct à l'API Supabase (policy admin_update_any_profile).
--
-- Règles après cette migration (appliquées côté serveur, pas seulement dans l'interface) :
--   1. Un changement de rôle exige d'être ADMIN ou SUPER_ADMIN (inchangé).
--   2. Personne ne peut modifier son PROPRE rôle depuis l'application.
--   3. Attribuer ou retirer SUPER_ADMIN est réservé à un SUPER_ADMIN.
--   4. Un contexte sans JWT utilisateur (SQL Editor, service_role) reste libre : c'est la
--      voie d'administration documentée (cf. migration 20260827150000).
--   5. Tout changement de rôle est inscrit dans audit_log (identifiant, ancien et nouveau
--      rôle ; aucun nom ni e-mail).
--
-- Retour arrière :
--   DROP TRIGGER IF EXISTS trg_audit_profile_role ON profiles;
--   DROP FUNCTION IF EXISTS audit_profile_role_change();
--   puis ré-exécuter prevent_role_self_escalation() de 20260827150000_fix_role_update_service_context.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Sans JWT utilisateur (Studio, SQL Editor, service_role) : voie d'administration, on laisse passer.
    IF auth.uid() IS NOT NULL THEN
      SELECT p.role INTO v_actor_role FROM profiles p WHERE p.id = auth.uid();
      IF v_actor_role IS NULL OR v_actor_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'Vous n''avez pas la permission de modifier ce rôle.' USING ERRCODE = '42501';
      END IF;
      IF NEW.id = auth.uid() THEN
        RAISE EXCEPTION 'Vous ne pouvez pas modifier votre propre rôle depuis l''application.' USING ERRCODE = '42501';
      END IF;
      IF (OLD.role = 'SUPER_ADMIN' OR NEW.role = 'SUPER_ADMIN') AND v_actor_role <> 'SUPER_ADMIN' THEN
        RAISE EXCEPTION 'Seul un super-administrateur peut attribuer ou retirer le rôle SUPER_ADMIN.' USING ERRCODE = '42501';
      END IF;
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

-- Journal : un changement de rôle est toujours tracé (identifiant uniquement, jamais de nom ni d'e-mail).
CREATE OR REPLACE FUNCTION audit_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM audit_write(
      'role_change', 'profiles', NEW.id::text, '',
      jsonb_build_object('changed_fields', jsonb_build_array('role'),
                         'changes', jsonb_build_object('role', jsonb_build_object('from', OLD.role, 'to', NEW.role)))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profile_role ON profiles;
CREATE TRIGGER trg_audit_profile_role
  AFTER UPDATE OF role ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION audit_profile_role_change();
