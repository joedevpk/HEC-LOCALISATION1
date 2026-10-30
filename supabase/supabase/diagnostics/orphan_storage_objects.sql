-- ============================================================================
-- Diagnostic LECTURE SEULE — cohérence photos : références en base <-> fichiers du Storage.
-- Aucune écriture : seulement des SELECT. À exécuter dans le SQL Editor Supabase.
--
--  1. Fichiers orphelins : présents dans Storage, référencés par AUCUNE ligne
--     (envoi interrompu, retrait de fichier échoué après suppression/remplacement).
--  2. Références cassées : ligne en base dont le fichier n'existe pas (photo « cassée » dans l'application).
--
-- Un orphelin peut être supprimé depuis Storage une fois confirmé ; une référence cassée se corrige en
-- renvoyant la photo ou en archivant la ligne depuis l'administration. Rien n'est supprimé automatiquement.
-- ============================================================================

-- 1. Fichiers orphelins
SELECT o.bucket_id, o.name AS chemin, o.created_at, (o.metadata->>'size')::bigint AS octets
FROM storage.objects o
WHERE o.bucket_id IN ('building-images', 'location-images')
  AND NOT EXISTS (SELECT 1 FROM public.building_images bi WHERE o.bucket_id = 'building-images' AND bi.storage_path = o.name)
  AND NOT EXISTS (SELECT 1 FROM public.location_images li WHERE o.bucket_id = 'location-images' AND li.storage_path = o.name)
ORDER BY o.created_at DESC;

-- 2. Références cassées (photos de bâtiments)
SELECT 'building-images' AS bucket_id, bi.id, bi.building_id, bi.storage_path, bi.archived_at
FROM public.building_images bi
WHERE NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'building-images' AND o.name = bi.storage_path)
UNION ALL
-- 2bis. Références cassées (photos de lieux)
SELECT 'location-images', li.id, li.location_id, li.storage_path, li.archived_at
FROM public.location_images li
WHERE NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'location-images' AND o.name = li.storage_path);
