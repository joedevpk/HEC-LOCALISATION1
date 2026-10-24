# RAPPORT D'AUDIT FINAL — HEC LOCALISATION (2ᵉ passe)

Date : 24 octobre 2026. Complète `RAPPORT_AUDIT_CARTOGRAPHIE.md` (1ʳᵉ passe).
**Verdict : l'application n'est PAS déclarée prête pour la production** (voir §6). Aucun commit, aucun
déploiement, aucun changement du schéma Supabase, des politiques RLS, des rôles ni des données. Aucune clé
secrète dans le code. Dépendances inchangées (aucun paquet ajouté).

## 1. Résultats d'exécution

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | RÉUSSI |
| `npm run lint` | RÉUSSI : 0 erreur, 6 avertissements « fast refresh » (5 préexistants + 1 dans le banc d'essai, sans effet) |
| `npm test` | RÉUSSI : **175 tests, 20 fichiers** (148 → 175 sur cette passe) |
| `npm run build` | RÉUSSI (le banc d'essai n'est pas inclus dans `dist/`) |
| Navigateur réel — vrai composant `CampusMap`, **ordinateur 1280×800 et mobile 390×844 tactile**, styles de fond **locaux** | RÉUSSI : **20/20** (`scripts/browser-check/campusmap-integration.py`) |
| Navigateur réel — MapLibre seul, styles locaux | RÉUSSI (`scripts/browser-check/maplibre-style-switch.py`) |
| Tests échoués | Aucun à la fin. En cours de route : 1 test existant mis à jour car il verrouillait un comportement défectueux, 1 autre car il réutilisait un même objet `Response` (voir §4), 1 de mes valeurs de référence était fausse (corrigée) |
| **Impossible ici** | Tout appel à MapTiler, ORS/OSRM, Overpass, Nominatim, Supabase (réseau du bac à sable bloqué) ; clés API ; données réelles du campus ; GPS ; application complète avec authentification |

Les tests unitaires utilisent des réponses de fournisseurs **simulées** : ils prouvent la logique, pas le fonctionnement des services.

## 2. Anomalies corrigées dans cette passe

### Critique

**R1 — Les lieux publics n'étaient jamais recréés après un changement de style.**
`src/lib/poi-icon-sprites.ts` (`waitForStyleReady`). Cause : l'attente n'écoutait que `styledata` et `load`.
Après un changement de style, `isStyleLoaded()` est encore faux à `style.load` et aucun autre de ces événements
ne suit : la promesse ne se résolvait jamais. Constaté **uniquement en navigateur réel** (traces dans le vrai
composant) ; la 1ʳᵉ passe croyait ce défaut corrigé, et les tests unitaires ne pouvaient pas le voir.
Correction : résolution sur `style.load`/`idle`, ou dès que le document de style est chargé (`getStyle()`), avec un délai de
dernier recours ; écouteurs retirés. Preuve : `poi-icon-wait.test.ts` (6 tests) + navigateur (lieux publics conservés après 5 changements
rapides ; restaurés en 0,2–0,5 s sur le fond de secours alors que ses tuiles échouent). Statut : **corrigé, testé en navigateur (styles locaux)**.

### Importantes

**R2 — Overpass : 502 et délais dépassés mal absorbés** (`src/lib/osm-poi.ts`). Causes constatées dans le code :
un seul serveur par défaut, réessayé jusqu'à 3 fois (donc 3 coups sur un service déjà en difficulté) ; aucune mémoire de l'état de chaque serveur ;
429 traité comme une simple panne ; page HTML ou réponse illisible non basculée.
Corrections : liste de serveurs configurable (`VITE_OVERPASS_URL`), défaut **overpass-api.de puis overpass.private.coffee** (le second seulement si le premier échoue) ;
une tentative par serveur, jamais de réinsistance sur un serveur qui répond 429 ; serveur en échec mis au repos (60 s ; 120 s après un 429) ;
avec un seul serveur : un seul réessai, jamais après un 429/403 ; 400 = pas de bascule ; annulation = arrêt immédiat ;
message final indiquant le nombre de serveurs essayés. 14 tests (`osm-poi-failover.test.ts`). Statut : **corrigé, testé avec réponses simulées ; NON vérifié avec les vrais serveurs**.

**R3 — Overpass : une panne pouvait passer pour « aucun lieu ».** Overpass peut répondre HTTP 200 avec un champ `remark` « runtime error… »
et une liste vide ou partielle. Cela était lu comme « aucun lieu » et mis en cache 10 min. Désormais traité comme une panne de serveur (bascule, pas de cache vide).
Test dédié. Statut : **corrigé, testé (simulé)**.

**R4 — Données périmées d'un miroir.** Une source tierce signale qu'un miroir a servi des données figées pendant des mois. L'âge (`osm3s.timestamp_osm_base`)
est contrôlé : au-delà de 30 jours (`VITE_OVERPASS_MAX_DATA_AGE_DAYS`) on préfère un serveur à jour ; à défaut, ces données réelles mais anciennes sont rendues en dernier
recours (avertissement console) plutôt qu'une panne. Statut : **testé (simulé)**. Le comportement réel de `overpass.private.coffee` n'est pas vérifié.

### Mineures

- Nouveau type d'erreur `bad_request` (HTTP 400/413/414) ; 403/404/408/5xx concernent le serveur et déclenchent la bascule.
- `map-config.ts` n'avait **aucun test** : 11 tests ajoutés (5 modes → 5 styles distincts, erreurs de configuration, style de secours, plafonds de zoom).
- Plafond de zoom satellite **optionnel** dérivé de la résolution native (`VITE_MAP_IMAGERY_NATIVE_MPP`) : ne fait rien tant qu'il n'est pas défini.
- Contrôle d'audit `DEMO_SEED_DATA` (voir §3).

## 3. Diagnostic objectif du flou satellite

**Ce qui est établi (documentation MapTiler, consultée en ligne) :** l'imagerie `satellite-v2` est de la Maxar à **1 m/pixel dans les zones les plus demandées et 2 m/pixel
ailleurs** ; la haute résolution aérienne couvre surtout des pôles économiques (États-Unis, Europe, Japon cités) ; au-delà du zoom natif l'image est étirée.

**Ce que cela implique à la latitude de Kinshasa (calcul reproduit par `imagery-resolution.ts`, 15 tests) :**

| Zoom MapLibre | m par pixel écran | Étirement si source 1 m/px | si 2 m/px |
|---|---|---|---|
| 16 | 1,19 | ×0,8 (net) | ×1,7 |
| 17 | 0,60 | ×1,7 | ×3,4 |
| 18 | 0,30 | ×3,4 | ×6,7 |
| 19 | 0,15 | ×6,7 | ×13,4 |

Le zoom maximal par défaut du code (19) **dépasse donc largement le détail réel** si l'imagerie du campus est à 1–2 m/px : le flou est alors attendu et n'est pas un bug.
Vos captures (toits et cours reconnaissables, sans détails fins) sont **cohérentes** avec cette hypothèse. **Je n'ai pas pu mesurer** la résolution réellement servie sur le campus
(aucun accès à MapTiler) ; je ne peux donc pas affirmer qu'il n'existe pas d'imagerie plus fine, ni choisir un autre fournisseur sans avoir vérifié sa couverture, son tarif et sa licence.
Aucun flou n'a été masqué (ni CSS, ni zoom artificiel).

Actions chez vous : `npm run probe:imagery -- --lng … --lat …` (heuristique, à confirmer à l'œil), puis soit `VITE_MAP_IMAGERY_NATIVE_MPP=<valeur>`, soit `VITE_MAP_MAXZOOM_SATELLITE=<zoom>`.

## 4. Vos captures d'écran : ce qu'elles montrent

- Carte **réelle et cohérente** entre Plan, Satellite, Hybride et Topographique (mêmes bâtiments, mêmes rues).
- Messages « 502 » et « délai de 12000 ms dépassé » : lieux publics (Overpass) — traités en R2–R4.
- **Donnée de démonstration visible :** l'URL `loc=00000000-0000-4000-a000-000000000101` est la **salle d'exemple** de la migration d'amorçage `20260903100000_seed_example_building_and_room.sql`,
  et la puce « INFO · Bâtiment Informatique » est le bâtiment d'exemple. Cette migration indique elle-même que ses coordonnées sont des **décalages autour du centre du campus, pas des relevés**.
  Rien n'a été supprimé ni déplacé (interdit sans votre accord). L'audit les signale désormais (`DEMO_SEED_DATA`). **À faire par vous : les archiver depuis l'admin.**
- Mode Topographique : fond de rues sans courbes de niveau visibles à ce zoom sur terrain plat ; je ne peux pas dire si c'est le style attendu ou un défaut (`npm run check:styles`).

## 5. Contrôles demandés

1. **Chargement des styles / secours** — logique : testée (map-config, map-resilience, 20 vérifications navigateur avec styles locaux : repli avec raison « style », retour au Plan, mode non configuré refusé).
   Fournisseurs réels : **non vérifié**.
2. **Flou satellite** — §3. Diagnostic documentaire et calculé ; mesure réelle **non faite**.
3. **Overpass** — R2–R4.
4. **Navigation piétonne** — 1ʳᵉ passe : classification des erreurs, cohérence départ/arrivée (≤ 1 km), (0,0) refusé, ordre [lng, lat] ; `CampusMap` rejette aussi les tracés invalides. Moteur réel (ORS/OSRM) : **non vérifié**.
5. **Coordonnées des lieux** — contrôleur d'audit (doublons, hors limites, relations, données d'exemple) : testé sur jeux synthétiques. **Vos données réelles n'ont pas été auditées** : `npm run audit:data` exige vos accès. Aucune coordonnée inventée ou déplacée.
6. **Mobile / bureau / couches / régression** — navigateur réel : conservation de l'itinéraire et des lieux publics (5 changements rapides), marqueurs réduits à faible zoom et bornés de près (≤ 166 px sur 390 px d'écran), pas de défilement horizontal, aucune exception JavaScript non gérée. **Limites :** styles locaux, un seul navigateur (Chromium), mobile émulé (pas un vrai téléphone), pas de GPS, pas d'authentification.
7. **Tests ajoutés** — `osm-poi-failover` (14), `poi-icon-wait` (6), `map-config` (11), `imagery-resolution` (9), + ajouts à `campus-audit`.

## 6. Problèmes encore ouverts / non vérifiés

1. Qualité réelle des 4 modes avec une vraie clé MapTiler ; identifiants de style (`npm run check:styles`) ; Topographique.
2. Résolution réelle de l'imagerie sur le campus ; éventuel autre fournisseur à évaluer (couverture, tarif, licence).
3. Joignabilité, limites et fraîcheur réelles des serveurs Overpass, notamment `overpass.private.coffee` ; les requêtes envoient la zone affichée à un tiers (retirable via `VITE_OVERPASS_URL`).
4. Overpass retourne les 200 premiers éléments, pas les plus proches du centre, sans avertissement de troncature.
5. Routage réel (ORS : CORS navigateur, quota ; OSRM : profil piéton du serveur).
6. Données Supabase réelles et politiques RLS ; archivage des données d'exemple.
7. GPS, vrais téléphones, performances/mémoire WebGL sur appareil réel, application complète authentifiée.
8. Le bandeau d'erreur de lieux publics n'indique pas encore quel serveur a répondu.

## 7. Fichiers modifiés ou ajoutés (cette passe)

Modifiés : `src/lib/osm-poi.ts`, `src/lib/poi-icon-sprites.ts`, `src/lib/map-config.ts`, `src/lib/campus-audit.ts`, `.env.example`, `docs/AUDIT_COMMANDES.md`, tests existants `osm-poi.test.ts` (2 modifications commentées), `campus-audit.test.ts` (ajout).
Ajoutés : `src/lib/imagery-resolution.ts`, tests `osm-poi-failover`, `poi-icon-wait`, `map-config`, `imagery-resolution` ; `scripts/browser-check/campusmap-integration.py` et `scripts/browser-check/harness/` (banc d'essai hors application).
