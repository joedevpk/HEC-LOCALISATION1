# Procédure de préproduction et de retour arrière

> **Rien ici n'a été exécuté contre vos services.** Ce sont des commandes à lancer **par vous**, d'abord en **préproduction** (projet Supabase et service Render **séparés** de la production), jamais directement en production. Remplacez les valeurs `<…>`.
> Toutes les commandes Supabase utilisent `--workdir supabase` (les migrations sont dans `supabase/supabase/migrations/` — voir `docs/SUPABASE_CLI.md`). **Ne jamais lancer `supabase db reset` sur un projet contenant des données.**

## 0. Pré-requis
- Un projet Supabase de préproduction (idéalement une copie restaurée de la production, voir `docs/BACKUP_RESTORE.md` §4) et un service Render de préproduction.
- Une **nouvelle clé OpenRouteService** (l'ancienne, publiée côté client, est à considérer compromise).
- Au moins un compte `SUPER_ADMIN` (voir étape 3 : après la migration de cette passe, plus aucun `ADMIN` ne peut en créer par l'application).

## 1. Sauvegarde (base **et** fichiers)
```bash
supabase db dump --db-url "$DATABASE_URL" -f backup-schema.sql
supabase db dump --db-url "$DATABASE_URL" --data-only -f backup-data.sql
```
Photos : exporter les buckets `building-images` et `location-images` (rclone/S3 ou tableau de bord). Conserver hors du dépôt, chiffré. **Vérifier qu'une restauration fonctionne** (BACKUP_RESTORE.md §6).

## 2. État du code (Git)
Cette archive ne contient pas de dossier `.git`. Dans **votre** dépôt :
```bash
git status                       # doit être propre ; sinon, enregistrer (commit) votre travail d'abord
git switch -c passe4-preprod     # nouvelle branche : retour arrière = revenir sur l'ancienne
```
Copiez le contenu du zip dans le dépôt **sans supprimer de fichier** (ne pas utiliser `rsync --delete`), puis `git status` et `git diff --stat` : seuls les fichiers listés dans `RAPPORT_MAITRE_PASSE_4.md` §« Fichiers modifiés » doivent apparaître. Enregistrer (commit).

## 3. Inventaire en lecture seule (SQL Editor de la préproduction)
Exécuter, sans rien modifier :
- `supabase/supabase/diagnostics/check_main_super_admin.sql` — **au moins un `SUPER_ADMIN` doit exister** avant l'étape 4.
- `supabase/supabase/diagnostics/inventory_demo_and_unverified_data.sql` — données de démonstration / non vérifiées déjà présentes.
- `supabase/supabase/diagnostics/orphan_storage_objects.sql` — photos orphelines / références cassées.
Noter les résultats (ils servent de comparaison après déploiement).

## 4. Migrations (dans l'ordre, après sauvegarde)
```bash
supabase --workdir supabase login
supabase --workdir supabase link --project-ref <ref-preprod>
supabase --workdir supabase migration list     # colonnes « Local » et « Remote » : lesquelles sont déjà appliquées ?
```
- Si l'historique distant correspond (toutes les anciennes migrations « Remote ») : `supabase --workdir supabase db push --dry-run`, vérifier qu'**une seule** migration est annoncée (`20261028090000_role_hierarchy_guard.sql`), puis `supabase --workdir supabase db push`.
- Si les migrations ont été appliquées **à la main** (SQL Editor) et que l'historique distant est vide ou incomplet : **ne pas** lancer `db push` (il tenterait de tout rejouer). Exécuter directement le contenu de `20261028090000_role_hierarchy_guard.sql` dans le SQL Editor (elle est rejouable). N'utilisez `migration repair` que sur des versions dont vous avez **vérifié** l'application.
- La migration de démonstration `20260903100000` est désormais inactive : aucune donnée fictive n'est ajoutée. Si l'ancienne version a déjà tourné, son bâtiment de démonstration reste en base, marqué « Démonstration » : à archiver ou supprimer depuis l'administration.
- Après application : rejouer `check_main_super_admin.sql` (le rôle du compte principal est inchangé).

## 5. Secrets de la fonction `route-walking`
```bash
supabase --workdir supabase secrets set ORS_API_KEY=<nouvelle-clé>
supabase --workdir supabase secrets set ALLOWED_ORIGINS=https://<domaine-render-preprod>
```
(optionnels : `ROUTING_ALLOWED_BBOX`, `ROUTING_RATE_PER_IP_PER_MIN`, `ROUTING_RATE_GLOBAL_PER_MIN`). Ne jamais mettre la clé dans le dépôt ni dans une variable `VITE_*`.

## 6. Déploiement de la fonction
```bash
supabase --workdir supabase functions deploy route-walking     # sans --no-verify-jwt
```
La fonction n'a **jamais été exécutée sous Deno** dans cette passe : vérifier les journaux (tableau de bord Supabase → Edge Functions → Logs) dès le premier appel.

## 7. Render (préproduction)
Environment : `VITE_ROUTING_PROVIDER=proxy` ; `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (clé **anon** uniquement, jamais `service_role`), `VITE_MAP_PROVIDER`, `VITE_MAP_API_KEY` (restreinte au domaine). **Supprimer** `VITE_ROUTING_API_KEY` et `VITE_ROUTING_URL` s'ils existent. Réécriture SPA `/*` → `/index.html` (type Rewrite). Variables lues **au build** : lancer un **nouveau déploiement** (un redémarrage ne suffit pas). Voir `docs/RENDER_ENV.md`.

## 8. Tests de fumée (le déploiement n'est « réussi » qu'après ceux-ci)
**Fonction** (substituer les valeurs ; coordonnées réelles relevées sur le terrain) :
```bash
URL=https://<ref>.supabase.co/functions/v1/route-walking
H=(-H "apikey: <ANON>" -H "Authorization: Bearer <ANON>" -H "Content-Type: application/json")
curl -i -X POST "$URL" "${H[@]}" -H "Origin: https://<domaine-render-preprod>" -d '{"from":[LNG,LAT],"to":[LNG,LAT]}'   # attendu : 200 + GeoJSON
curl -i -X POST "$URL" "${H[@]}" -H "Origin: https://autre-domaine.example" -d '{"from":[LNG,LAT],"to":[LNG,LAT]}'      # attendu : 403
curl -i -X POST "$URL" "${H[@]}" -H "Origin: https://<domaine-render-preprod>" -d '{"from":[0,0],"to":[LNG,LAT]}'        # attendu : 400
curl -i -X POST "$URL" -H "Content-Type: application/json" -H "Origin: https://<domaine-render-preprod>" -d '{}'          # attendu : 401 (sans jeton)
head -c 5000 /dev/zero | tr '\0' 'a' > gros.txt; curl -i -X POST "$URL" "${H[@]}" -H "Origin: https://<domaine-render-preprod>" --data-binary @gros.txt   # attendu : 413
```
**Sécurité (rôles)** : connecté en `ADMIN` (pas `SUPER_ADMIN`), tenter de passer son propre rôle à `SUPER_ADMIN` via l'API : l'opération doit être **refusée** ; vérifier qu'un changement de rôle légitime par un `SUPER_ADMIN` apparaît dans le journal d'audit.
**Application** : ouvrir la page d'accueil, la carte, une fiche de lieu ; calculer 3 itinéraires réels (distance comparée à un autre outil) ; couper le réseau pendant un calcul (message « Erreur réseau » + « Réessayer ») ; ouvrir un lien QR/`?nav=` à froid (le départ se trouve ou le choix manuel apparaît) ; administration → Données : import d'un CSV **invalide** (rien n'est écrit) puis d'un CSV valide de test sur la préproduction ; vérifier dans le JavaScript déployé que l'ancienne clé ORS n'apparaît plus.
**Photos** : envoyer, remplacer, classer, supprimer une photo de test ; relancer `orphan_storage_objects.sql` (aucun nouvel orphelin attendu).

## 9. Passage en production
Seulement après la préproduction réussie **et** votre autorisation explicite : refaire les étapes 1 à 8 sur la production, un service à la fois. Révoquer l'ancienne clé ORS après confirmation.

# Retour arrière
| Élément | Action |
|---|---|
| **Front (Render)** | Tableau de bord Render → *Deploys* → redéployer la version précédente (Rollback). |
| **Code** | `git switch <ancienne-branche>` (rien n'a été supprimé de l'historique). |
| **Fonction Edge** | Revenir au commit précédent, puis `supabase --workdir supabase functions deploy route-walking`. En urgence : remettre `VITE_ROUTING_PROVIDER=ors` + `VITE_ROUTING_API_KEY` (mode historique, clé exposée au navigateur — dernier recours) et redéployer le front. |
| **Migration `20261028090000`** | Exécuter `supabase/supabase/rollback/20261028090000_role_hierarchy_guard_rollback.sql` (testé en local). **Attention : cela rétablit la faille d'escalade de privilèges** ; les lignes de journal déjà écrites sont conservées. |
| **Migration de démonstration** | Rien à annuler (inactive). Pour retirer un bâtiment de démonstration déjà présent : archivage depuis l'administration, ou suppression SQL décrite à la fin du fichier de migration. |
| **Données corrompues** | Restaurer depuis la sauvegarde de l'étape 1 **dans un projet vide** (BACKUP_RESTORE.md §4), jamais par-dessus la production. |
| **Photos** | Les fichiers ne sont pas modifiés par ces migrations ; restaurer depuis l'export de l'étape 1 si nécessaire. |
