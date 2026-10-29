# Gouvernance des données institutionnelles (passe 3)

## 1. Constats de l'audit (base reconstruite et testée sur PostgreSQL 16 local avec simulation minimale de Supabase)
1. **Toutes les migrations s'appliquent dans l'ordre** sur une base vierge, **sauf** `20260903100000_seed_example_building_and_room.sql` :
   elle **échoue si aucun campus n'existe** (« Aucun campus trouvé ») et bloquerait `supabase db push` sur une base neuve. Elle insère aussi des
   **données de démonstration** (un bâtiment « Bâtiment Informatique », une entrée, une salle) dans la chaîne de migrations. Historique non réécrit :
   pour une base neuve, créer le campus avant, ou retirer cette migration de la chaîne de *votre* déploiement.
2. **Lignes archivées lisibles publiquement** : les policies de lecture étaient `USING (true)` ; seul le client filtrait. Corrigé par la nouvelle migration (RLS).
3. **Aucun contrôle de validation côté serveur** : tout gestionnaire pouvait modifier n'importe quelle donnée. Corrigé (triggers de garde).
4. **Aucun journal d'audit.** Ajouté.
5. **Stockage** : écriture réservée aux administrateurs (déjà vrai), mais chemin et rattachement non contraints. Contraints par la nouvelle migration.
   Limite : les buckets sont **publics en lecture** ; un fichier de photo archivée reste accessible par son URL exacte tant qu'il n'est pas supprimé.
6. **Défaut du campus** : la table `campuses` a un centre par défaut (15.3, −4.32) — approximation, pas une mesure : à remplacer par la vraie position.
7. Côté interface : les contrôles de photo n'apparaissaient qu'au survol (inutilisables au tactile), la galerie d'une salle sans photo affichait **silencieusement**
   les photos du bâtiment, et un bâtiment/lieu non validé n'était pas distingué. Corrigés.

## 2. Rôles (modèle existant conservé)
| Action | Visiteur / Étudiant / Personnel | CAMPUS_MANAGER | ADMIN / SUPER_ADMIN |
|---|---|---|---|
| Lire lieux et photos actifs | oui | oui | oui |
| Lire les éléments archivés | non (serveur) | oui | oui |
| Créer / modifier / archiver bâtiments, salles, étages, photos, importer | non | oui | oui |
| **Valider** (bâtiment, salle, photo) ou retirer la validation | non | **non** | oui |
| Modifier les coordonnées d'un lieu **validé** | non | **non** | oui |
| Lire le journal d'audit | non | non | oui |
Une seule fonction (`is_data_validator()`) définit « qui valide » : modifiable sans toucher au reste.
Remplacer le fichier d'une photo validée **annule sa validation** (la nouvelle image doit être revue).

## 3. Migrations à appliquer — ordre exact
Sauvegarde d'abord (`docs/BACKUP_RESTORE.md`), idéalement sur une copie de préproduction.
1. `supabase/supabase/diagnostics/inventory_demo_and_unverified_data.sql` (lecture seule) — lire le résultat.
2. `20261026090000_data_provenance_columns.sql` (passe 1, additive).
3. `20261027090000_institutional_governance.sql` (passe 3, additive, idempotente).
Aucune suppression de données. Les éléments existants restent **« en attente »** : l'interface les signale « Non validé » jusqu'à validation par un administrateur.
**Attention** : après la migration, un gestionnaire (CAMPUS_MANAGER) ne peut plus valider ; il faut qu'un ADMIN valide les lieux contrôlés sur le terrain.

## 4. Retour arrière (si nécessaire)
```sql
DROP TRIGGER IF EXISTS trg_guard_buildings ON buildings;  DROP TRIGGER IF EXISTS trg_guard_locations ON locations;
DROP TRIGGER IF EXISTS trg_guard_building_images ON building_images; DROP TRIGGER IF EXISTS trg_guard_location_images ON location_images;
DROP TRIGGER IF EXISTS trg_audit_buildings ON buildings; DROP TRIGGER IF EXISTS trg_audit_locations ON locations; DROP TRIGGER IF EXISTS trg_audit_floors ON floors;
DROP TRIGGER IF EXISTS trg_audit_building_images ON building_images; DROP TRIGGER IF EXISTS trg_audit_location_images ON location_images;
CREATE POLICY ... (recréer les policies de lecture d'origine : USING (true) sur buildings, locations, building_images, location_images)
-- les colonnes ajoutées et audit_log peuvent rester (additifs) ; pour tout retirer : DROP TABLE audit_log; ALTER TABLE ... DROP COLUMN ...
```
Les policies de stockage d'origine se trouvent dans `20260828100000_building_images.sql` et `20260829000000_location_images.sql`.

## 5. Tests de permissions — reproduire
```
sudo apt install postgresql          # puis, depuis la racine du dépôt :
sudo -u postgres bash supabase/tests/run_local.sh
```
Le script recrée une base de test, simule le strict nécessaire de Supabase (`auth.uid()`, rôles, `storage.objects`) dans `00_supabase_stubs.sql`
(**jamais sur un vrai projet**), rejoue **toutes** les migrations dans l'ordre (+ 2ᵉ passage de la dernière pour l'idempotence), puis exécute
`10_permissions.sql` : 60 contrôles PASS/FAIL (visiteur, étudiant, gestionnaire, admin ; RLS, triggers de garde, audit, import atomique, Storage).
Limite : c'est un PostgreSQL ordinaire, pas le moteur Supabase réel (GoTrue, Storage API). **À rejouer sur un projet Supabase de préproduction avant la production.**

## 6. Journal d'audit
Table `audit_log` (append-only : aucune policy d'écriture, privilèges retirés, alimentée par triggers `SECURITY DEFINER`). Enregistre : acteur (id + rôle), action
(création, modification, déplacement, validation, archivage, restauration, suppression, photo remplacée, import), objet, date, et seulement l'ancienne/nouvelle valeur de
colonnes non sensibles (nom, code, statut, coordonnées, archivage, ordre, légende). Aucun secret ni donnée personnelle. Lecture : ADMIN / SUPER_ADMIN.
Les opérations faites depuis l'éditeur SQL (sans utilisateur) sont journalisées avec l'acteur « système ».
