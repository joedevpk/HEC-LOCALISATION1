/*
# Admin write access to campus data (buildings, floors, locations)

## Overview
The core schema made campuses/buildings/floors/locations public-read only,
with "no client write policies — this data is operator-managed" (see the
original schema migration). This adds scoped write access so that users
whose `profiles.role` is ADMIN, SUPER_ADMIN or CAMPUS_MANAGER can manage
buildings, floors and locations (rooms) directly from the app's admin
panel, instead of needing the Supabase dashboard.

Purely additive: no existing table, column or policy is changed or
removed. Public read access is untouched.

## Changes
- New policies on `buildings`, `floors`, `locations`: INSERT/UPDATE/DELETE
  for authenticated users whose profile role is one of
  ('ADMIN', 'SUPER_ADMIN', 'CAMPUS_MANAGER').
- A small helper function `is_campus_admin()` centralizes the role check
  so the same rule is reused across every policy below.
*/

CREATE OR REPLACE FUNCTION is_campus_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('ADMIN', 'SUPER_ADMIN', 'CAMPUS_MANAGER')
  );
$$;

-- buildings: admin-scoped write
DROP POLICY IF EXISTS "admin_insert_buildings" ON buildings;
CREATE POLICY "admin_insert_buildings" ON buildings FOR INSERT TO authenticated
  WITH CHECK (is_campus_admin());
DROP POLICY IF EXISTS "admin_update_buildings" ON buildings;
CREATE POLICY "admin_update_buildings" ON buildings FOR UPDATE TO authenticated
  USING (is_campus_admin()) WITH CHECK (is_campus_admin());
DROP POLICY IF EXISTS "admin_delete_buildings" ON buildings;
CREATE POLICY "admin_delete_buildings" ON buildings FOR DELETE TO authenticated
  USING (is_campus_admin());

-- floors: admin-scoped write
DROP POLICY IF EXISTS "admin_insert_floors" ON floors;
CREATE POLICY "admin_insert_floors" ON floors FOR INSERT TO authenticated
  WITH CHECK (is_campus_admin());
DROP POLICY IF EXISTS "admin_update_floors" ON floors;
CREATE POLICY "admin_update_floors" ON floors FOR UPDATE TO authenticated
  USING (is_campus_admin()) WITH CHECK (is_campus_admin());
DROP POLICY IF EXISTS "admin_delete_floors" ON floors;
CREATE POLICY "admin_delete_floors" ON floors FOR DELETE TO authenticated
  USING (is_campus_admin());

-- locations (rooms/salles): admin-scoped write
DROP POLICY IF EXISTS "admin_insert_locations" ON locations;
CREATE POLICY "admin_insert_locations" ON locations FOR INSERT TO authenticated
  WITH CHECK (is_campus_admin());
DROP POLICY IF EXISTS "admin_update_locations" ON locations;
CREATE POLICY "admin_update_locations" ON locations FOR UPDATE TO authenticated
  USING (is_campus_admin()) WITH CHECK (is_campus_admin());
DROP POLICY IF EXISTS "admin_delete_locations" ON locations;
CREATE POLICY "admin_delete_locations" ON locations FOR DELETE TO authenticated
  USING (is_campus_admin());
