# Passe 4 — Rapport des tests exécutés

Tous les chiffres ci-dessous proviennent d'exécutions réelles dans cette passe. Aucun test n'a été supprimé ni affaibli : une seule assertion existante a été **modifiée** (voir §5).

## 1. Référence (avant modification) puis état final
| Contrôle | Commande | Avant | Final |
|---|---|---|---|
| Typecheck | `npm run typecheck` | OK | OK |
| Lint | `npm run lint` | 0 erreur, 6 avertissements | 0 erreur, 6 avertissements (identiques) |
| Tests unitaires | `npm test` (vitest) | **281/281** (29 fichiers) | **338/338** (33 fichiers) |
| Build production | `npm run build` | OK | OK (PWA : 63 entrées précachées) |
| Permissions SQL (PostgreSQL 16 local) | `runuser -u postgres -- bash supabase/tests/run_local.sh` | 60/60 | **77/77** |
| Scénarios de migration | `OLD_MIGRATIONS=<ancienne chaîne> runuser -u postgres -- bash supabase/tests/20_scenarios.sh` | — | **23/23** |

## 2. Tests navigateur (Chromium 153 headless, `scripts/browser-check/audit-app.mjs`)
Commande : `CHROMIUM_PATH=<chrome> node scripts/browser-check/audit-app.mjs routing|responsive|admin-data|styles`
- **Itinéraires : 13/13** — calculé (distance = longueur du tracé ±3 %), réseau coupé, 503 indisponible, 429, 502 mal configuré, 404 fonction absente, 403 jeton refusé, 404 aucun chemin, 200 sans chemin, 200 corrompu, **réessayer après erreur réseau**, panneau d'erreur à 320 et 768 px. Chaque échec : bon titre/catégorie, « Réessayer » présent seulement si pertinent, sélecteur de départ conservé, aucune distance ni durée affichée.
- **Responsive : 200/200** mesures (25 pages × 8 largeurs), 0 débordement horizontal, 0 exception JS.
- **Changement de style de carte : OK** (`... audit-app.mjs styles`, 390 px) — itinéraire affiché, puis bascule Plan → Satellite → Hybride → Topographique → Sombre → Plan : les **7 marqueurs** restent identiques dans chaque style, le tracé reste affiché (mesuré par pixels, panneau de styles ouvert comme référence), aucun recalcul ni erreur. **Limite** : les styles de test sont des aplats de couleur **sans tuiles** ; la netteté des tuiles réelles (flou du satellite en gros zoom), la disponibilité de chaque mode chez le fournisseur réel et la couche des lieux publics OpenStreetMap (source externe bloquée) ne sont **pas** testées.
- **Administration → Données : 4/4 largeurs** — inventaire (démo identifiée, « Photo non disponible », lien OpenStreetMap), CSV invalide refusé (ligne 3, aucun bouton Importer, aucun appel d'écriture), CSV valide (relecture obligatoire, un seul appel atomique, virgule décimale), journal d'audit, absence de débordement.

## 3. Nouveaux tests ajoutés (vitest et SQL)
`route-failure.test.ts` (catégories d'échec, exhaustivité des types), `geolocate-race.test.ts` (contrôle natif non prêt ; vérifie aussi la version de MapLibre), `photo-storage-consistency.test.ts` (extension MIME, suppression vérifiée, orphelin signalé), `csv-template.test.ts` (modèle non importable), compléments dans `csv-import.test.ts` (formats numériques), `routing-proxy-core.test.ts` (clé client, corps borné), `10_permissions.sql` (+17 : hiérarchie des rôles, journal), `20_scenarios.sh` (5 scénarios).

## 4. Ce qui n'a PAS été testé
- Supabase réel (Auth, RLS sur le vrai `storage.objects`, Edge Functions), OpenRouteService réel, Render, fournisseur de tuiles réel : **aucun**.
- La fonction Edge `index.ts` n'a pas été exécutée sous Deno ; seule sa logique pure (`core.ts`) l'est.
- Envoi réel de photos (navigateur + Storage), scan QR par caméra, mode sombre, navigation au clavier, contrastes, lecteur d'écran, appareil mobile réel.
- Les tests SQL tournent sur une **simulation minimale** de Supabase (`supabase/tests/00_supabase_stubs.sql`) : résultats « PostgreSQL local uniquement ».
- La partie « fichiers orphelins » de `orphan_storage_objects.sql` n'a pas pu être exécutée (le stub local de `storage.objects` n'a pas `created_at` ni `metadata`) ; la partie « références cassées » l'a été.
- Les tests navigateur utilisent un **faux** serveur Supabase et un **faux** proxy de routage : ils prouvent le comportement de l'interface, pas celui des services.
- Les 25 pages du balayage responsive ont toutes été mesurées sur le **code final** (aucune modification de code depuis) ; je n’ai regardé visuellement que quelques captures (accueil 390 px, panneau d’erreur 320 px, itinéraire calculé), pas les 200.
- Le serveur de développement Vite de mon environnement s’est arrêté à plusieurs reprises après quelques minutes de tests (`ERR_CONNECTION_REFUSED`) : les pages concernées ont été relancées seules, sans erreur de page constatée ; c’est une limite du banc d’essai.

## 5. Assertion existante modifiée
`walking-route-proxy.test.ts` : le cas `upstream_unavailable` attendait `network_error` ; il attend maintenant `service_unavailable` (nouveau type, pour ne plus confondre « votre réseau coupe » et « le service est en panne »). Les fournisseurs directs ORS/OSRM sont inchangés. Le mock de `governance-api.test.ts` a été étendu (conserve les fonctions réelles) sans retirer d'assertion.
