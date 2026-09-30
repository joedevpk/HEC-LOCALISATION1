/*
# Correctif : mise à jour du rôle bloquée depuis Supabase Studio / SQL editor

## Problème corrigé
La migration 20260826210000 a introduit `trg_prevent_role_self_escalation`
pour empêcher un utilisateur connecté de s'auto-promouvoir ADMIN /
SUPER_ADMIN / CAMPUS_MANAGER. Le trigger bloque toute modification de la
colonne `role` sauf si :

  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN','SUPER_ADMIN'))

Cette condition suppose qu'il y a toujours un `auth.uid()` défini. Or,
quand une modification est faite depuis le Table Editor de Supabase Studio,
depuis le SQL Editor, ou depuis un script d'administration utilisant la
clé `service_role` (donc SANS JWT utilisateur), `auth.uid()` vaut NULL.
Le EXISTS ne trouve alors jamais de ligne et le trigger lève
systématiquement l'exception "Vous n'avez pas la permission de modifier
ce rôle.", même quand c'est un administrateur du projet qui agit
directement dans Supabase.

C'est très probablement la cause exacte du bug rapporté : le rôle du
compte MAIN a été mis à SUPER_ADMIN depuis Supabase, mais l'UPDATE a été
silencieusement rejeté par ce trigger, donc `public.profiles.role` n'a
jamais réellement changé.

Le trigger d'inscription `trg_restrict_self_signup_role` (même migration)
gérait déjà correctement ce cas en ne s'appliquant que
`IF auth.uid() IS NOT NULL`. On applique ici la même logique au trigger de
mise à jour.

## Changement
`prevent_role_self_escalation()` : le contrôle de permission ne s'applique
désormais que lorsque la requête provient d'un utilisateur authentifié
(`auth.uid() IS NOT NULL`), c'est-à-dire depuis l'application cliente.
Une modification faite sans JWT utilisateur (Studio, SQL Editor, script
avec la clé service_role) reste donc possible, comme c'est déjà le cas
pour l'attribution du rôle à l'inscription.

Purement additif / correctif : aucune table, colonne ou policy n'est
supprimée. La protection contre l'auto-promotion depuis l'application
reste entièrement active.
*/

CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- auth.uid() IS NULL => requête sans JWT utilisateur (Supabase Studio,
    -- SQL Editor, script service_role) : on laisse passer, comme pour
    -- l'inscription (trg_restrict_self_signup_role).
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('ADMIN', 'SUPER_ADMIN')
    ) THEN
      RAISE EXCEPTION 'Vous n''avez pas la permission de modifier ce rôle.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Le trigger existant réutilise automatiquement cette fonction (CREATE OR
-- REPLACE ci-dessus) ; on le recrée explicitement par sécurité.
DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON profiles;
CREATE TRIGGER trg_prevent_role_self_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_self_escalation();
