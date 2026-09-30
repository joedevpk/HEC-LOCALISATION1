-- ÉTAPE 9 : diagnostic du compte MAIN
-- À exécuter dans le SQL Editor de Supabase (Studio) en remplaçant l'e-mail.

-- 1. Le compte existe-t-il, a-t-il un profil, quel rôle a-t-il réellement ?
SELECT
  au.id            AS auth_user_id,
  au.email,
  p.id             AS profile_id,
  p.full_name,
  p.role,
  p.created_at
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE au.email = 'EMAIL_DU_COMPTE_MAIN';

-- Résultats attendus / anomalies à surveiller :
--   * profile_id est NULL              -> aucun profil pour ce user (le
--     trigger d'auto-création dans AuthContext ne s'exécute qu'à la
--     connexion ; créez la ligne manuellement si besoin, cf. requête 4).
--   * role IS NULL ou 'STUDENT'        -> la mise à jour du rôle n'a pas
--     été appliquée (c'était le bug corrigé par la migration
--     20260827150000_fix_role_update_service_context.sql).
--   * plusieurs lignes                 -> deux comptes auth.users partagent
--     le même e-mail (rare) ou un profil est mal lié.

-- 2. Y a-t-il un profil "orphelin" (lié à un UUID qui n'existe plus dans auth.users) ?
SELECT p.*
FROM public.profiles p
LEFT JOIN auth.users au ON au.id = p.id
WHERE au.id IS NULL;

-- 3. Y a-t-il plus d'un profil SUPER_ADMIN / ADMIN que prévu (vérification rapide) ?
SELECT id, full_name, role
FROM public.profiles
WHERE role IN ('SUPER_ADMIN', 'ADMIN', 'CAMPUS_MANAGER')
ORDER BY role;

-- 4. Mettre (ou remettre) explicitement le compte MAIN en SUPER_ADMIN.
-- Exécuté depuis le SQL Editor, cette requête n'a pas de auth.uid() défini
-- donc n'est plus bloquée par trg_prevent_role_self_escalation une fois la
-- migration 20260827150000 appliquée.
UPDATE public.profiles
SET role = 'SUPER_ADMIN'
WHERE id = (SELECT id FROM auth.users WHERE email = 'EMAIL_DU_COMPTE_MAIN');

-- Si la ligne 4 renvoie "UPDATE 0", c'est qu'aucun profil n'existe pour ce
-- user : il faut d'abord l'insérer, par ex. :
-- INSERT INTO public.profiles (id, full_name, role)
-- SELECT id, 'MAIN', 'SUPER_ADMIN' FROM auth.users WHERE email = 'EMAIL_DU_COMPTE_MAIN'
-- ON CONFLICT (id) DO UPDATE SET role = 'SUPER_ADMIN';
