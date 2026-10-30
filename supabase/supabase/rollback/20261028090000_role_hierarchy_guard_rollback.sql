-- ============================================================================
-- RETOUR ARRIÈRE de 20261028090000_role_hierarchy_guard.sql (hors dossier migrations : jamais appliqué par la CLI).
-- Restaure le comportement de 20260827150000 : tout ADMIN / SUPER_ADMIN peut changer n'importe quel rôle (y compris le sien
-- et SUPER_ADMIN) — c'est la faille corrigée par la passe 4 ; ne l'utiliser qu'en cas de blocage avéré.
-- Les lignes déjà inscrites dans audit_log (action 'role_change') sont CONSERVÉES.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_audit_profile_role ON profiles;
DROP FUNCTION IF EXISTS audit_profile_role_change();

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
    IF auth.uid() IS NOT NULL THEN
      SELECT p.role INTO v_actor_role FROM profiles p WHERE p.id = auth.uid();
      IF v_actor_role IS NULL OR v_actor_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'Vous n''avez pas la permission de modifier ce rôle.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
