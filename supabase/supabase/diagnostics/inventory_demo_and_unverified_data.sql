-- LECTURE SEULE — inventaire à exécuter dans le SQL Editor AVANT toute décision de nettoyage.
-- 1) Lignes d'exemple connues
SELECT 'building' AS kind, id, name, code FROM buildings WHERE id = '00000000-0000-4000-a000-000000000b01'
UNION ALL
SELECT 'location', id, name, code FROM locations WHERE building_id = '00000000-0000-4000-a000-000000000b01';
-- 2) Doublons probables de bâtiments (même code ou même nom, hors archivés)
SELECT lower(name) AS nom, count(*) FROM buildings WHERE archived_at IS NULL GROUP BY 1 HAVING count(*) > 1;
-- 3) Coordonnées dupliquées (signe de coordonnées dérivées du centre du campus)
SELECT round(lng::numeric, 6) AS lng, round(lat::numeric, 6) AS lat, count(*)
  FROM locations WHERE archived_at IS NULL GROUP BY 1, 2 HAVING count(*) > 1;
-- 4) Éléments non validés
SELECT 'buildings' AS t, verification_status, count(*) FROM buildings GROUP BY 2
UNION ALL SELECT 'locations', verification_status, count(*) FROM locations GROUP BY 2;
