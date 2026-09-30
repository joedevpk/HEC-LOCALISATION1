-- =====================================================================
-- PHASE 6 — règles 12 (index) et 15 (limite de poids, CÔTÉ SERVEUR).
--
-- 100 % NON DESTRUCTIF et idempotent :
--   * aucune suppression de table, colonne, ligne ou index ;
--   * les index sont créés IF NOT EXISTS (relançable sans risque) ;
--   * seule la LIMITE de taille des buckets d'images est abaissée
--     (8 Mo -> 5 Mo) : les fichiers déjà stockés ne sont pas touchés.
-- À appliquer via `supabase db push` ou l'éditeur SQL Supabase, de
-- préférence après une sauvegarde (voir docs/BACKUP_RESTORE.md).
-- =====================================================================

-- ---- 1. Limite de poids côté serveur (le frontend compresse déjà) ----
UPDATE storage.buckets
   SET file_size_limit = 5242880,  -- 5 Mo
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
 WHERE id IN ('building-images', 'location-images');

-- ---- 2. Index correspondant aux requêtes réellement émises par l'app ----
-- (colonnes vérifiées dans les migrations existantes ; les index simples
--  déjà présents sont conservés)

-- getEvents(campusId) : WHERE campus_id = ? ORDER BY starts_at
CREATE INDEX IF NOT EXISTS campus_events_campus_starts_idx
  ON campus_events (campus_id, starts_at);

-- getAnnouncements(campusId) : WHERE campus_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS announcements_campus_created_idx
  ON announcements (campus_id, created_at DESC);

-- getNotifications(userId) : WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);

-- getRecentSearches(userId) : WHERE user_id = ? ORDER BY created_at DESC LIMIT 6
CREATE INDEX IF NOT EXISTS search_history_user_created_idx
  ON search_history (user_id, created_at DESC);

-- getBookings(userId) / getReports(userId) : WHERE user_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS bookings_user_created_idx
  ON bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_user_created_idx
  ON reports (user_id, created_at DESC);
