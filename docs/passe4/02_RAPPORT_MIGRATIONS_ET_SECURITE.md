# Passe 4 — Rapport migrations et sécurité

## 1. Migrations
Ordre d'application vérifié sur PostgreSQL 16 local (simulation minimale de Supabase) : 16 fichiers, tous appliqués sans erreur sur une base **neuve sans campus**.

| Scénario | Résultat |
|---|---|
| S1 Base neuve sans campus | chaîne complète OK ; 0 bâtiment, 0 lieu, 0 campus inventé |
| S2 Base neuve avec campus | chaîne complète OK ; campus intact ; démo **non** insérée |
| S3 Base avec données réelles | migrations suivantes OK ; donnée réelle inchangée ; rien de « validé » ; rien de marqué démo |
| S4 Base déjà migrée (ancienne chaîne, démo appliquée) | seule la nouvelle migration s'applique ; rejouable ; le rejeu de la démo n'écrase pas une modification ; la démo existante reste `seed_demo`/`pending` |
| S5 Activation volontaire de la démo | insérée, marquée `seed_demo` même exécutée après la migration de provenance, jamais validée |

Reproduire : `runuser -u postgres -- bash supabase/tests/20_scenarios.sh` (variable `OLD_MIGRATIONS=<ancienne chaîne>` pour S4).

### Migration `20260903100000` (démonstration)
Avant : exception sans campus (bloque `db push`), insertion silencieuse d'un bâtiment fictif avec campus. Après : **inactive par défaut** (NOTICE), activable par `SET hec.allow_demo_seed = 'on'`. Fichier conservé (historique). Une base où l'ancienne version a été appliquée n'est pas modifiée.
### Migrations `20261026090000` (provenance) et `20261027090000` (gouvernance)
Réappliquées dans la chaîne, rejouables, aucune validation automatique après migration (testé : S3).

### Structure des dossiers et CLI Supabase (testé avec la CLI 2.122.0)
Les migrations sont dans `supabase/supabase/migrations/`.
- Depuis la **racine du projet**, la CLI cherche `supabase/migrations/` : elle **ne voit pas** les 15 migrations existantes (et crée un dossier vide à côté avec `migration new`).
- Avec `--workdir supabase`, ou depuis le dossier `supabase/`, la CLI utilise bien `supabase/supabase/migrations/`.
- Décision : **rien n'a été déplacé** (pas de doublon, historique et horodatages inchangés). Utiliser systématiquement `supabase --workdir supabase <commande>`. Voir `docs/SUPABASE_CLI.md`.
- Aucun `config.toml` n'existe dans l'archive ; non nécessaire pour `migration new` ; `link`, `db push` et `functions deploy` n'ont pas pu être testés (pas d'accès au projet).

## 2. Sécurité
### Corrigé
- **Escalade de privilèges** (démontrée) : un `ADMIN` pouvait s'attribuer ou attribuer `SUPER_ADMIN` par appel direct. Migration `20261028090000_role_hierarchy_guard.sql` : nul ne modifie son propre rôle ; `SUPER_ADMIN` (attribution ou retrait) réservé à un `SUPER_ADMIN` ; contexte sans JWT (SQL Editor, service_role) conservé ; chaque changement de rôle est journalisé (identifiants et rôles seulement, sans nom ni e-mail). 17 contrôles SQL ajoutés. Retour arrière testé : `supabase/supabase/rollback/20261028090000_role_hierarchy_guard_rollback.sql`.
- **Fonction Edge** : identifiant du limiteur pris dans `cf-connecting-ip` (non falsifiable par le client) avant `x-forwarded-for` ; corps limité à 2 Ko (413). Non vérifié sur l'infrastructure Supabase réelle.
- **Photos** : la suppression ne retire plus le fichier si la ligne n'a pas été supprimée (RLS silencieuse) ; un fichier orphelin est signalé (console) ; extension déduite du type MIME.

### Vérifié et conforme (T-sql)
Visiteur sans écriture ; étudiant sans droit d'administration ; gestionnaire limité (pas de validation) ; validation réservée aux administrateurs ; journal d'audit lisible par les rôles autorisés seulement ; lignes archivées non lisibles publiquement ; import par un étudiant refusé ; contrôles de stockage (rôles, chemin).

### Risques résiduels (non corrigés)
1. **`audit_write` appelable directement** par tout gestionnaire/administrateur : il peut inscrire de fausses lignes (l'acteur reste son identité réelle). Le client ne l'appelle jamais. Correction possible : rendre `import_campus_data` `SECURITY DEFINER` ou isoler l'écriture d'audit — non faite (change la sémantique d'une fonction testée).
2. **Buckets de photos publics en lecture** : une photo archivée reste accessible par son URL exacte. Non présenté comme confidentiel. Si les photos doivent être protégées : bucket privé + URL signées (non implémenté).
3. Un `ADMIN` peut encore modifier le rôle d'un autre `ADMIN` (hors `SUPER_ADMIN`) — conforme à la conception actuelle.
4. Le limiteur de débit de la fonction Edge est **par instance** (mémoire) : il atténue, ne garantit pas, un plafond global ; le quota ORS reste la limite finale.
5. Un gestionnaire peut importer des données (création « en attente » uniquement) — conforme à la conception, à confirmer par l'institution.
6. Cache du service worker (NetworkFirst) sur les requêtes de données : sur un appareil partagé, un contenu vu par un administrateur peut être resservi hors ligne ; non évalué plus avant.

### Limites de cet audit
Les politiques RLS ont été relues pour les tables du schéma initial, des rôles, de la gouvernance, des photos et du stockage. Les tables d'extension (réservations, signalements, notifications, événements) n'ont été examinées que par la liste de leurs politiques, pas par des tests d'attaque. Tests SQL sur une simulation minimale de Supabase (`auth.uid()`, rôles) : **à rejouer en préproduction sur le vrai service**, notamment `storage.objects`.
