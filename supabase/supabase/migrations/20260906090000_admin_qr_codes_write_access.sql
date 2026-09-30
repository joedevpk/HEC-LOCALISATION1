/*
# Correctif : écriture admin manquante sur qr_codes

## Problème corrigé
La migration 20260824165619_add_extension_tables.sql a activé RLS sur
`qr_codes` et créé une policy de lecture publique (`public_read_qr`), mais
n'a jamais ajouté les policies d'écriture admin — contrairement à toutes
les autres tables "opérateur" du projet (`buildings`, `building_images`,
`location_images`, `route_nodes`...), qui suivent toutes le même schéma
public-read + admin-write via `is_campus_admin()`.

Conséquence : `toggleQRCode()` (src/lib/extension-api.ts), utilisée par le
bouton Activer/Désactiver de QRPage.tsx, échoue systématiquement avec une
erreur RLS (42501) — et aucune ligne ne peut jamais être insérée dans
`qr_codes` depuis l'application, quel que soit le rôle de l'utilisateur.

Purement additif : aucune table, colonne ou policy existante n'est
modifiée ou supprimée. La lecture publique reste inchangée.

## Changements
- Policies `admin_insert_qr_codes`, `admin_update_qr_codes`,
  `admin_delete_qr_codes` sur `qr_codes`, réutilisant `is_campus_admin()`
  (déjà définie par 20260826090000_admin_campus_write_access.sql).
*/

DROP POLICY IF EXISTS "admin_insert_qr_codes" ON qr_codes;
CREATE POLICY "admin_insert_qr_codes" ON qr_codes FOR INSERT TO authenticated
  WITH CHECK (is_campus_admin());

DROP POLICY IF EXISTS "admin_update_qr_codes" ON qr_codes;
CREATE POLICY "admin_update_qr_codes" ON qr_codes FOR UPDATE TO authenticated
  USING (is_campus_admin()) WITH CHECK (is_campus_admin());

DROP POLICY IF EXISTS "admin_delete_qr_codes" ON qr_codes;
CREATE POLICY "admin_delete_qr_codes" ON qr_codes FOR DELETE TO authenticated
  USING (is_campus_admin());
