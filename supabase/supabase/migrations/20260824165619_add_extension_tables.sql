/*
# HEC Smart Navigator — extension schema (settings, notifications, bookings, reports, schedules, QR)

## Overview
Adds tables for the professional extension of the platform: per-user settings
(language, theme, accessibility, notification preferences), a notification
center, room bookings, issue reports, course schedules, and QR code references.

## New Tables
- `user_settings` — one row per user. language (fr/en/ln), theme (light/dark/
  system), text_size, high_contrast, reduce_motion, accessible_nav,
  notif_* boolean prefs, created_at, updated_at.
- `notifications` — per-user notifications. user_id, type, title, body, is_read,
  related_id, created_at.
- `bookings` — room reservation requests. user_id, location_id, date, start_time,
  end_time, purpose, status (PENDING/APPROVED/REJECTED/CANCELLED), created_at.
- `reports` — issue reports. user_id, category, description, location_label,
  status (NEW/IN_PROGRESS/RESOLVED/REJECTED), created_at.
- `schedules` — course timetable entries. campus_id, course_name, teacher_name,
  room_id, day_of_week, start_time, end_time. Visible to all.
- `qr_codes` — QR references for locations. location_id, code (unique),
  is_active, created_at.

## Security
- RLS enabled on every table.
- `schedules` and `qr_codes`: public read (anon + authenticated).
- `user_settings`, `notifications`, `bookings`, `reports`: owner-scoped CRUD
  with user_id defaulting to auth.uid().

## Notes
1. `user_settings` uses ON CONFLICT for upsert — the frontend updates settings
   by inserting a full row; if it exists, it updates.
2. Booking conflict prevention is enforced in the frontend by querying
   existing bookings for the same location/date/time overlap.
3. All owner-scoped tables cascade on user deletion.
*/

CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'fr',
  theme text NOT NULL DEFAULT 'system',
  text_size text NOT NULL DEFAULT 'normal',
  high_contrast boolean NOT NULL DEFAULT false,
  reduce_motion boolean NOT NULL DEFAULT false,
  accessible_nav boolean NOT NULL DEFAULT true,
  notif_announcements boolean NOT NULL DEFAULT true,
  notif_events boolean NOT NULL DEFAULT true,
  notif_room_changes boolean NOT NULL DEFAULT true,
  notif_courses boolean NOT NULL DEFAULT true,
  notif_bookings boolean NOT NULL DEFAULT true,
  notif_maintenance boolean NOT NULL DEFAULT true,
  notif_alerts boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  related_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_user_idx ON notifications(user_id);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  purpose text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_location_idx ON bookings(location_id, date);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other',
  description text NOT NULL DEFAULT '',
  location_label text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'NEW',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status);

CREATE TABLE IF NOT EXISTS schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  course_name text NOT NULL,
  teacher_name text NOT NULL DEFAULT '',
  room_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  day_of_week int NOT NULL DEFAULT 1,
  start_time text NOT NULL,
  end_time text NOT NULL
);
CREATE INDEX IF NOT EXISTS schedules_campus_day_idx ON schedules(campus_id, day_of_week);

CREATE TABLE IF NOT EXISTS qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qr_location_idx ON qr_codes(location_id);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;

-- user_settings: owner-scoped upsert/read/update
DROP POLICY IF EXISTS "select_own_settings" ON user_settings;
CREATE POLICY "select_own_settings" ON user_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "upsert_own_settings" ON user_settings;
CREATE POLICY "upsert_own_settings" ON user_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_settings" ON user_settings;
CREATE POLICY "update_own_settings" ON user_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- notifications: owner-scoped
DROP POLICY IF EXISTS "select_own_notifs" ON notifications;
CREATE POLICY "select_own_notifs" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_notifs" ON notifications;
CREATE POLICY "insert_own_notifs" ON notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_notifs" ON notifications;
CREATE POLICY "update_own_notifs" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_notifs" ON notifications;
CREATE POLICY "delete_own_notifs" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- bookings: owner-scoped
DROP POLICY IF EXISTS "select_own_bookings" ON bookings;
CREATE POLICY "select_own_bookings" ON bookings FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_bookings" ON bookings;
CREATE POLICY "insert_own_bookings" ON bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_bookings" ON bookings;
CREATE POLICY "update_own_bookings" ON bookings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_bookings" ON bookings;
CREATE POLICY "delete_own_bookings" ON bookings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- reports: owner-scoped
DROP POLICY IF EXISTS "select_own_reports" ON reports;
CREATE POLICY "select_own_reports" ON reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_reports" ON reports;
CREATE POLICY "insert_own_reports" ON reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_reports" ON reports;
CREATE POLICY "delete_own_reports" ON reports FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- schedules: public read
DROP POLICY IF EXISTS "public_read_schedules" ON schedules;
CREATE POLICY "public_read_schedules" ON schedules FOR SELECT TO anon, authenticated USING (true);

-- qr_codes: public read
DROP POLICY IF EXISTS "public_read_qr" ON qr_codes;
CREATE POLICY "public_read_qr" ON qr_codes FOR SELECT TO anon, authenticated USING (true);