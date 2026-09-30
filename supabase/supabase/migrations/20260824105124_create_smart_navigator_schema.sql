/*
# HEC Smart Navigator — core schema

## Overview
Creates the campus data model for the HEC Smart Navigator platform: a hierarchy of
organizations, campuses, buildings, floors and locations, plus per-user profiles,
favorites and search history. Campus reference data is publicly readable so the
public map and visitor mode work without sign-in; personal data is owner-scoped.

## New Tables
- `profiles` — one row per authenticated user. Columns: id (uuid, = auth.users.id),
  full_name (text), role (text, default 'STUDENT'), created_at.
- `campuses` — a physical campus. name, tagline, city, center_lng, center_lat,
  default_zoom, created_at.
- `buildings` — buildings on a campus. campus_id, name, code, description,
  category, color, center_lng, center_lat, floor_count, created_at.
- `floors` — floors within a building. building_id, level (int), name, sort_order.
- `locations` — searchable places (rooms, offices, services, points of interest,
  entrances, facilities). building_id, floor_id, name, code, kind, category,
  description, capacity, lng, lat, is_accessible, created_at.
- `campus_events` — events shown to everyone. campus_id, title, description,
  image_url, starts_at, location_label, organizer.
- `announcements` — campus announcements. campus_id, title, body, category,
  created_at.
- `favorites` — a user's saved locations. user_id (default auth.uid()),
  location_id, created_at. Unique per (user, location).
- `search_history` — a user's recent searches. user_id (default auth.uid()),
  query, created_at.

## Security
- RLS enabled on every table.
- Reference data (campuses, buildings, floors, locations, campus_events,
  announcements) is readable by anon + authenticated (public campus map / visitor
  mode). No client write policies — this data is operator-managed.
- profiles: each authenticated user can read/insert/update only their own row.
- favorites & search_history: owner-scoped CRUD for authenticated users; owner
  column defaults to auth.uid().

## Notes
1. Coordinates are stored as plain longitude/latitude doubles for direct use with
   MapLibre GL JS (GeoJSON order is [lng, lat]).
2. All ids are uuids. Foreign keys cascade on delete so removing a building removes
   its floors and locations.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'STUDENT',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tagline text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  center_lng double precision NOT NULL DEFAULT 15.3,
  center_lat double precision NOT NULL DEFAULT -4.32,
  default_zoom double precision NOT NULL DEFAULT 17,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'academic',
  color text NOT NULL DEFAULT '#1e5eff',
  center_lng double precision NOT NULL,
  center_lat double precision NOT NULL,
  floor_count int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS buildings_campus_idx ON buildings(campus_id);

CREATE TABLE IF NOT EXISTS floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  level int NOT NULL DEFAULT 0,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS floors_building_idx ON floors(building_id);

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid REFERENCES buildings(id) ON DELETE CASCADE,
  floor_id uuid REFERENCES floors(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'room',
  category text NOT NULL DEFAULT 'general',
  description text NOT NULL DEFAULT '',
  capacity int,
  lng double precision NOT NULL,
  lat double precision NOT NULL,
  is_accessible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS locations_building_idx ON locations(building_id);
CREATE INDEX IF NOT EXISTS locations_kind_idx ON locations(kind);

CREATE TABLE IF NOT EXISTS campus_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL DEFAULT now(),
  location_label text NOT NULL DEFAULT '',
  organizer text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'GENERAL',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, location_id)
);
CREATE INDEX IF NOT EXISTS favorites_user_idx ON favorites(user_id);

CREATE TABLE IF NOT EXISTS search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  query text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_history_user_idx ON search_history(user_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE campus_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

-- Public reference data: readable by everyone
DROP POLICY IF EXISTS "public_read_campuses" ON campuses;
CREATE POLICY "public_read_campuses" ON campuses FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_read_buildings" ON buildings;
CREATE POLICY "public_read_buildings" ON buildings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_read_floors" ON floors;
CREATE POLICY "public_read_floors" ON floors FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_read_locations" ON locations;
CREATE POLICY "public_read_locations" ON locations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_read_events" ON campus_events;
CREATE POLICY "public_read_events" ON campus_events FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_read_announcements" ON announcements;
CREATE POLICY "public_read_announcements" ON announcements FOR SELECT TO anon, authenticated USING (true);

-- profiles: owner-scoped
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- favorites: owner-scoped
DROP POLICY IF EXISTS "select_own_favorites" ON favorites;
CREATE POLICY "select_own_favorites" ON favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_favorites" ON favorites;
CREATE POLICY "insert_own_favorites" ON favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_favorites" ON favorites;
CREATE POLICY "delete_own_favorites" ON favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- search_history: owner-scoped
DROP POLICY IF EXISTS "select_own_history" ON search_history;
CREATE POLICY "select_own_history" ON search_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_history" ON search_history;
CREATE POLICY "insert_own_history" ON search_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_history" ON search_history;
CREATE POLICY "delete_own_history" ON search_history FOR DELETE TO authenticated USING (auth.uid() = user_id);
