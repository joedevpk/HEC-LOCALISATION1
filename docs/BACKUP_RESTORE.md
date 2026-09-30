# Sauvegarde et restauration — HEC Localisation

> La base Supabase contient les bâtiments, lieux, photos (références), réseau
> piéton, comptes et rôles. **Elle est critique.** Ce document décrit quoi
> vérifier et comment restaurer. Aucune commande ci‑dessous ne supprime de
> données tant que vous ne la lancez pas vous‑même.

## 1. Ce qu'il faut vérifier dans le tableau de bord Supabase (à faire par l'administrateur)
Le contenu du projet ne permet pas de savoir quelle offre Supabase est utilisée ; **non vérifié** ici :
- *Project Settings → Database → Backups* : sauvegardes quotidiennes (offre Pro et plus, 7 jours de rétention par défaut). L'offre gratuite n'inclut **pas** de sauvegarde restaurable : dans ce cas, appliquer la section 2 avant la présentation officielle.
- *Point‑in‑Time Recovery* : option payante ; à activer si les données évoluent beaucoup.
- Les **fichiers du Storage** (photos) ne sont pas dans la sauvegarde de la base : les exporter séparément (section 3).

## 2. Sauvegarde manuelle (toujours possible)
Avec la CLI Supabase et l'URL de connexion (*Settings → Database → Connection string*) :
```bash
supabase db dump --db-url "$DATABASE_URL" -f backup-schema.sql
supabase db dump --db-url "$DATABASE_URL" --data-only -f backup-data.sql
supabase db dump --db-url "$DATABASE_URL" --role-only -f backup-roles.sql   # optionnel
```
Conserver les fichiers **hors du dépôt** (ils contiennent des données personnelles) et chiffrés.

## 3. Photos (Storage)
Buckets : `building-images`, `location-images`. Sauvegarde : outil `rclone` (backend S3 de Supabase, clés dans *Storage → S3 Connection*) ou téléchargement depuis le tableau de bord.

## 4. Restauration
1. **Créer un projet Supabase vide** (ne jamais restaurer par‑dessus la production sans avoir sauvegardé son état actuel).
2. `psql "$NEW_DATABASE_URL" -f backup-schema.sql` puis `-f backup-data.sql`.
3. Ré‑importer les photos dans les mêmes buckets, mêmes chemins.
4. Vérifier : nombre de lignes de `buildings`, `locations`, `route_nodes`, `route_segments` ; se connecter avec un compte admin ; ouvrir la carte ; calculer un itinéraire.
5. Mettre à jour `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` puis redéployer.
6. Si la restauration vient de la fonction de sauvegarde Supabase : suivre *Database → Backups → Restore*.

## 5. Migrations
- Les migrations du dépôt sont **additives**. Avant toute migration : sauvegarde (section 2).
- La migration `20260930090000_storage_limits_and_indexes.sql` ne supprime rien : elle abaisse la limite d'upload des buckets d'images à 5 Mo (les fichiers existants ne sont pas modifiés) et crée 6 index `IF NOT EXISTS`.
- Ne jamais lancer `supabase db reset` sur la production (il efface toutes les données).

## 6. Test de restauration
Une sauvegarde qui n'a jamais été restaurée n'est pas une sauvegarde. Restaurer une fois dans un projet de test avant la présentation officielle.
