# RAPPORT MAÎTRE — Passe 4 (audit, corrections, tests réels, préparation de la présentation)

Rapports détaillés dans `docs/passe4/` :
`01_RAPPORT_AUDIT_GENERAL` · `02_RAPPORT_MIGRATIONS_ET_SECURITE` · `03_RAPPORT_TESTS` · `04_PROBLEMES_CORRIGES_ET_NON_RESOLUS` · `05_PROCEDURE_PREPRODUCTION` (avec retour arrière) · `06_CHECKLIST_TEST_TELEPHONE` · `07_ACTIONS_UTILISATEUR`.
Modèle CSV : `docs/modeles/modele_donnees_institutionnelles.csv` + `docs/MODELE_CSV_INSTITUTIONNEL.md`. Guide CLI : `docs/SUPABASE_CLI.md`.

## Résumé
Le projet existant a été conservé (aucune reconstruction, aucune migration supprimée, aucune fonctionnalité retirée). Onze défauts ont été corrigés, dont une **escalade de privilèges ADMIN → SUPER_ADMIN** (démontrée), une migration qui **bloquait toute base neuve** et un **blocage de géolocalisation** sur les liens profonds. Dix points restent ouverts ou à vérifier (voir `04`).

## Résultats (exécutions réelles)
| Contrôle | Avant | Après |
|---|---|---|
| Typecheck / Lint / Build | OK / 0 erreur, 6 avertissements / OK | OK / identique / OK |
| Tests unitaires | 281/281 | **338/338** |
| Permissions SQL (PostgreSQL 16 local, stubs Supabase) | 60/60 | **77/77** |
| Scénarios de migration (5 cas) | — | **23/23** |
| Itinéraires, Chromium réel, proxy **simulé** | — | **13/13** |
| Responsive, Chromium réel (25 pages × 8 largeurs) | — | **200/200**, 0 débordement, 0 erreur JS |
| Administration → Données, Chromium réel | — | **4/4 largeurs** |
| Changement de style de carte (5 modes), Chromium réel, styles **sans tuiles** | — | OK : marqueurs et tracé conservés |

**Pas testé** : Supabase réel, OpenRouteService réel, Render, Deno, appareil mobile, envoi réel de photos, mode sombre, clavier, contrastes, lecteur d'écran. Les tests SQL tournent sur une simulation minimale de Supabase ; les tests navigateur sur un faux serveur Supabase et un faux proxy de routage (fixtures fictives).

## Niveaux
| Niveau | Statut | Justification |
|---|---|---|
| **1 — Prêt pour pilote** | **Non déclaré atteint** | Conditions techniques réunies côté code et local (tests ci-dessus, procédure de préproduction, retour arrière testé). Il sera atteint quand **vous** aurez déployé en préproduction et réussi les tests de fumée (`05` §8). |
| **2 — Prêt pour le Directeur général** | **Non atteint** | Manquent : parcours testés avec les **vrais services**, itinéraires **réels** vérifiés sur le terrain, **données institutionnelles fiables** (coordonnées mesurées, photos autorisées), test sur appareil réel. |
| **3 — Prêt pour production** | **Non atteint** | Manquent : validation sur Supabase réel (RLS, Storage), sauvegarde/restauration éprouvées, supervision, tests de charge, accessibilité (clavier, contrastes, lecteur d'écran), traitement des risques N-01 et N-02, procédures opérationnelles validées. |

## Fichiers modifiés par rapport à la passe 3
Code : `src/components/{CampusMap,HeroSlideshow,LegalLayout,LocationDetail,RoutePanel,ui}.tsx` · `src/pages/{LandingPage,MapPage}.tsx` · `src/lib/{api,csv-import,image-compress,walking-route}.ts`.
Fonction Edge : `supabase/supabase/functions/route-walking/{core,index}.ts`.
Migration modifiée (rendue inactive par défaut) : `supabase/supabase/migrations/20260903100000_seed_example_building_and_room.sql`.
Tests modifiés : `src/lib/__tests__/{csv-import,governance-api,routing-proxy-core,walking-route-proxy}.test.ts` · `supabase/tests/{10_permissions.sql,run_local.sh}`.
Docs modifiée : `docs/GOUVERNANCE_DONNEES.md` (constat n°1) · `README.md` (renvoi vers la passe 4).

## Fichiers ajoutés
`src/lib/route-failure.ts` · tests `src/lib/__tests__/{route-failure,geolocate-race,photo-storage-consistency,csv-template}.test.ts` · `supabase/supabase/migrations/20261028090000_role_hierarchy_guard.sql` · `supabase/supabase/rollback/20261028090000_role_hierarchy_guard_rollback.sql` · `supabase/supabase/diagnostics/orphan_storage_objects.sql` · `supabase/tests/20_scenarios.sh` · `scripts/browser-check/{audit-app,mock-supabase}.mjs` · `docs/{SUPABASE_CLI,MODELE_CSV_INSTITUTIONNEL}.md` · `docs/modeles/modele_donnees_institutionnelles.csv` · `docs/passe4/*` · ce rapport.

## Pour rejouer les tests
```bash
npm ci && npm run typecheck && npm run lint && npm test && npm run build
service postgresql start && chmod -R a+rX . && runuser -u postgres -- bash supabase/tests/run_local.sh
OLD_MIGRATIONS=<ancienne chaîne de migrations> runuser -u postgres -- bash supabase/tests/20_scenarios.sh
npm i --no-save playwright-core && CHROMIUM_PATH=<chrome> node scripts/browser-check/audit-app.mjs routing   # puis responsive, admin-data, styles
```
