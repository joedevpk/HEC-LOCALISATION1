# Rapport — Passe 3 : données institutionnelles et administration

Verdict : **prêt pour un pilote sur une base de préproduction ; pas encore validé en production.** Les migrations et permissions ont été exécutées sur un
**PostgreSQL 16 local** (simulation minimale de Supabase), pas sur votre projet Supabase ni sur Render. Aucune donnée réelle n'a été créée ni inventée.

## Constats d'audit (détail : `docs/GOUVERNANCE_DONNEES.md`)
- Les migrations s'appliquent dans l'ordre, **sauf la migration de seed (démo)** qui échoue sans campus existant et injecte un bâtiment de démonstration.
- Les lignes **archivées étaient lisibles publiquement** (RLS `USING (true)`) ; aucun contrôle serveur de validation ; aucun journal d'audit.
- Interface : commandes photo invisibles au tactile ; galerie d'une salle affichant **silencieusement** les photos du bâtiment ; aucune distinction « validé / non validé ».
- Le centre par défaut du campus (15.3, −4.32) est une approximation.

## Réalisé
1. **Migration `20261027090000_institutional_governance.sql`** (additive, idempotente, aucune suppression) : colonnes photos (archivage, statut, type) ; `is_data_validator()` ;
   triggers de garde (validation et coordonnées d'un lieu validé réservées aux ADMIN/SUPER_ADMIN, `verified_by/at` non falsifiables, remplacement de photo = revalidation) ;
   `audit_log` append-only alimenté par triggers ; RLS : archivés invisibles du public ; Storage : chemin `<uuid-parent>/<uuid>.<ext>` + parent existant ;
   `import_campus_data()` atomique.
2. **Administration → onglet « Données »** : inventaire en lecture seule (validés, non validés, démo, sans photo, coordonnées suspectes, archivés), validation/retrait,
   archivage/restauration, lien de vérification sur carte ; **Import CSV** (modèle, prévisualisation, doublons, contrôle des coordonnées, récapitulatif, confirmation, écriture « tout ou rien ») ;
   **Journal d'audit**.
3. **Photos** (`PhotoManager`) : ajout multiple, couverture, type, légende/texte alternatif, ordre, **remplacement** (ordre sûr, rollback), archivage/restauration, validation, suppression ;
   commandes toujours visibles, cibles ≥ 44 px, images en chargement différé.
4. **Public** : badge « Non validé / Validé / Démonstration » sur les fiches et « Non validé » sur les cartes ; **« Photo non disponible »** explicite ; photos du bâtiment étiquetées comme telles ; photos archivées jamais affichées.
5. **Responsive admin** : le sélecteur de sections passe à la ligne au lieu de déborder ; grilles et listes sans largeur fixe.

## Tests (résultats réels)
- **Base : 60 contrôles PASS / 0 FAIL** (`sudo -u postgres bash supabase/tests/run_local.sh`) : visiteur, étudiant, gestionnaire, admin ; RLS, triggers, audit, import atomique, Storage ; +2ᵉ passage idempotent.
  Ces tests ont révélé un vrai défaut de ma première version (règle Storage inopérante à cause de `name` ambigu) — corrigé avant livraison.
- **Vitest : 281 / 281** (238 existants inchangés + 43 nouveaux : qualité des données, CSV, API de gouvernance avec Supabase simulé, analyse statique des migrations). typecheck OK, lint 0 erreur (6 avertissements préexistants), build OK.
- Les 238 tests existants n'ont subi aucune modification.

## Commandes / déploiement
1. Sauvegarde, puis dans le SQL Editor (préproduction d'abord) : inventaire en lecture seule → `20261026090000` → `20261027090000`.
2. `git`/Render : redéployer le front (aucune nouvelle variable d'environnement).
3. Un ADMIN valide ensuite les lieux contrôlés sur le terrain (onglet Données).
⚠ Après migration, **tout est « Non validé »** et un CAMPUS_MANAGER ne peut plus valider : c'est voulu, mais l'effet visible est immédiat.

## Non validé / limites
- Aucun test sur votre vraie base Supabase (GoTrue, Storage API) ni sur Render ; aucun test navigateur/mobile réel (responsive vérifié par lecture de code et build).
- Buckets publics : un fichier de photo archivée reste accessible par son URL exacte tant qu'il n'est pas supprimé.
- Le formulaire historique de création/modification (AdminCampusManager) n'affiche pas le statut ; la validation se fait dans l'onglet Données. Les entrées sont des lieux de type « entrance ».
- Import : une salle doit avoir ses propres coordonnées (contrainte du schéma actuel). Pas d'import tableur .xlsx (CSV uniquement). Mesure GPS terrain : procédure non automatisée (utiliser « Vérifier sur la carte »).
- L'audit ne couvre pas les routes/nœuds de navigation ni les profils utilisateurs.
- Migration de seed (démo) toujours dans la chaîne : décision à prendre pour les bases neuves.
- Données réelles toujours à fournir : coordonnées mesurées, photographies officielles, noms officiels, codes, plans, horaires confirmés.
