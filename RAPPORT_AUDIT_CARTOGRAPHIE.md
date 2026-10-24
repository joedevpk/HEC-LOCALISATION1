# RAPPORT D'AUDIT — CARTOGRAPHIE HEC LOCALISATION

Date : 22 octobre 2026. Périmètre : code de l'archive `HEC-LOCALISATION-cartographie-reelle`.
**Verdict : le projet n'est PAS déclaré « prêt pour la production »** — les contrôles critiques qui exigent vos clés
et le terrain (voir §7) n'ont pas pu être exécutés.

Aucun commit, aucun déploiement, aucune modification du schéma Supabase, des politiques RLS, des rôles ou des
données. Aucune clé n'apparaît dans ce rapport ni dans le dépôt (recherche effectuée : aucune clé en dur).

## 1. Ce qui a été réellement exécuté

| Type | Contrôle | Résultat |
|---|---|---|
| Automatisé | `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` | typecheck OK · lint 0 erreur (5 avertissements préexistants) · **134 tests OK sur 16 fichiers** (92 au départ) · build OK |
| Simulé | Réponses de fournisseurs simulées (`fetch` remplacé) : erreurs HTTP, corps jamais reçu, JSON invalide, annulation, quotas | OK — prouve la logique du code, **pas** le fonctionnement des fournisseurs |
| Appel réel | MapTiler, ORS, Overpass, Nominatim, Supabase | **AUCUN** : le réseau du bac à sable ne joint pas ces services (HTTP 000) |
| Navigateur réel | Chromium + WebGL, styles **locaux**, `scripts/browser-check/maplibre-style-switch.py` | OK — confirme le comportement de MapLibre 4.7.1 (voir A1/A2). **Teste MapLibre, pas votre application ni un fournisseur** |
| Navigateur réel | Application complète sur ordinateur et mobile | **NON FAIT** (exige Supabase et clés) |
| Documentation | Codes d'erreur ORS ; identifiants de style MapTiler | Consultés en ligne (voir §4) |

Les nouveaux tests de géocodage (6) ont été vérifiés comme **échouant sur le code d'origine et réussissant sur le code corrigé**. Pour les autres correctifs, la reproduction préalable n'a été faite que pour B3 (test en échec avant correction).

## 2. Anomalies (par gravité)

Statuts : **T-local** = corrigé et testé localement · **T-nav** = confirmé en navigateur (MapLibre seul) · **NV** = non vérifié avec un service réel.

### Critiques

**A1 — Le mode annoncé ne correspondait pas au fond affiché.**
`src/lib/map-resilience.ts` (`classifyMapError`), `src/components/CampusMap.tsx` (gestionnaire `error`).
Cause : un `style.json` en échec (404 identifiant inexistant, réseau, 5xx) émet une erreur **sans `sourceId`** ; elle était comptée « passagère » (4 requises avant repli). En mode diff, MapLibre garde l'ancien fond ; l'interface annonçait le nouveau mode.
Correction : nouvelle catégorie `style` → repli immédiat et message honnête ; raison distincte pour l'administrateur ; `fallbackReasonFor`.
Preuve : `map-style-failure.test.ts` (8 tests) ; comportement MapLibre confirmé en navigateur. Statut : **T-local, T-nav**. NV avec un vrai fournisseur.
Un test existant verrouillait le défaut (`map-resilience.test.ts`) : il a été **modifié**, avec commentaire explicatif.

**A2 — Les lieux publics disparaissaient au changement de mode.**
`CampusMap.tsx`. Le diff de style retire les sources `route` et `external-pois` **sans émettre `style.load`** ; seul l'itinéraire était restauré.
Correction : `setStyle(..., { diff: false })` (reconstruction complète, `style.load` garanti), filet `styledata` étendu aux lieux publics, `refreshPoiLayers` protégé (carte détruite / style remplacé pendant le chargement des icônes).
Preuve : navigateur réel (diff : pas de `style.load`, source retirée ; `diff:false` : `style.load` émis ; nouveau style chargeable après un échec). Statut : **T-nav pour MapLibre ; l'application elle-même n'a pas été testée en navigateur**.
Conséquence à connaître : avec `diff:false`, un style illisible laisse la carte **vide** jusqu'au repli — d'où l'importance de A1.

**B3 — Chargement des lieux publics perdu après un déplacement de carte.**
`src/lib/osm-poi.ts` (`fetchExternalPOIs`). Une requête partagée héritait du signal d'annulation de la précédente ; le rafraîchissement échouait silencieusement.
Correction : requête partagée avec son propre contrôleur et comptage d'abonnés. Preuve : `osm-poi-inflight.test.ts` (échec avant, succès après). Statut : **T-local**.

### Importantes

- **C1 — Nominatim : 1 requête/s non respectée** (`geocoding.ts`) : recherches simultanées parties ensemble. Correction : file sérialisée ; une recherche annulée ne consomme pas de créneau. **T-local**.
- **C2 — Délai supprimé trop tôt** (`geocoding.ts`, `walking-route.ts`, `osm-poi.ts`) : un corps de réponse jamais reçu bloquait indéfiniment. Correction : délai maintenu pendant la lecture ; erreurs `timeout` / `abort` correctes. **T-local**.
- **C3 — Routage : tout HTTP 400 présenté comme « aucun chemin »** (`walking-route.ts`). Correction : `classifyRoutingFailure` distingue aucun chemin / requête refusée (`bad_request`) / trop long / quota / accès. **T-local**.
- **C4 — Tracé non cohérent avec la demande** : un tracé commençant ou finissant à plus de 1 km du point demandé est refusé. Coordonnées (0,0) refusées (tracés et géocodage). **T-local**.
- **C5 — Recalcul d'itinéraire externe** (`MapPage.tsx`) : tant qu'un calcul était en vol, chaque variation GPS < 40 m l'annulait et le relançait (clignotement, quota gaspillé). Correction : `shouldKeepExternalRoute`, annulation explicite. Logique **T-local** ; l'intégration dans la page n'a pas été testée en navigateur.
- **C6 — Mode non disponible chez le fournisseur** : « Hybride » sous Esri pointait sur la même imagerie que « Satellite ». L'identifiant par défaut est supprimé ; un mode refusé garde le fond actuel et affiche un message (`onStyleModeRejected`) au lieu de bloquer la carte. Typecheck et build OK ; **comportement non testé en navigateur**.
- **C7 — Autocomplétion après refus** (`use-place-search.ts`) : une clé refusée (403) relançait une requête à chaque frappe. Pause de 60 s (403) / 15 s (429) ; « Réessayer » reste immédiat. **T-local** (durées testées, pas le hook).
- **C8 — Clés dans la console** : les erreurs MapLibre contiennent `?key=…`. Masquage par `maskSecretsInUrl`. **T-local**.
- **C9 — Données : relations** (`campus-audit.ts`) : ajout de `LOCATION_BUILDING_DANGLING` et `ENTRANCE_WITHOUT_BUILDING`. **T-local** (jeu de test synthétique ; les données réelles n'ont pas été auditées).

### Mineures

- Cache de géocodage borné (100 entrées) ; proximité invalide non envoyée. **T-local**.
- Style Sombre par défaut : `dataviz-dark` → `streets-v2-dark` (fond de rues lisible). **NV** : identifiant documenté, non testé avec une clé ; surchargeable (`VITE_MAP_STYLE_ID_DARK`).

## 3. Fichiers modifiés ou ajoutés

Modifiés : `src/lib/osm-poi.ts`, `geocoding.ts`, `walking-route.ts`, `map-resilience.ts`, `map-config.ts`, `use-place-search.ts`, `campus-audit.ts`, `src/components/CampusMap.tsx`, `src/pages/MapPage.tsx`, `.env.example`, `package.json` (2 scripts), tests existants `map-resilience.test.ts` (1 test), `geocoding.test.ts`, `campus-audit.test.ts` (ajouts).
Ajoutés : `src/lib/imagery-probe.ts`, tests `osm-poi-inflight`, `geocoding-robustness`, `walking-route-errors`, `map-style-failure`, `use-place-search`, `imagery-probe` ; `scripts/check-map-styles.ts`, `scripts/probe-imagery.ts`, `scripts/browser-check/maplibre-style-switch.py` ; `docs/AUDIT_COMMANDES.md`.

## 4. Vérifications documentaires (sources externes, pas des tests)

- ORS : un point non routable renvoie HTTP 404 + code 2010 (rayon d'accrochage 350 m par défaut) — d'après la documentation et les forums ORS. Les codes 2004/2009 sont gérés par message et par code mais **non confirmés ici**.
- MapTiler : la page officielle « Deprecated maps and datasets » indique que les styles dépréciés ne sont pas supprimés ; des styles « v4 » existent (`satellite-v4`, `hybrid-v4`, `topo-v4`…). Aucun identifiant n'a été testé avec une clé.

## 5. Satellite flou — diagnostic NON établi

Je n'ai pas pu mesurer l'imagerie : aucune clé, aucun accès réseau vers MapTiler. **Je ne peux pas dire** si le flou vient d'une imagerie de faible résolution sur Kinshasa ou d'un zoom autorisé au-delà du détail réel. Rien n'a été masqué par CSS ni par zoom artificiel.
À faire chez vous : `npm run probe:imagery` (heuristique sur le poids des tuiles, **non calibrée**, à confirmer à l'œil sur le campus), puis fixer `VITE_MAP_MAXZOOM_SATELLITE`. Si le détail réel est insuffisant, un autre fournisseur d'imagerie devra être évalué (disponibilité sur Kinshasa, tarif, licence) — non évalué ici.

## 6. Clés et configurations à fournir (sans valeurs)

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAP_PROVIDER`, `VITE_MAP_API_KEY` (restreindre au domaine + quota chez MapTiler), `VITE_ROUTING_*` (ORS ou OSRM piéton réel), éventuellement `VITE_MAP_STYLE_ID_*`, `VITE_MAP_MAXZOOM_SATELLITE`. Les variables `VITE_*` sont publiques côté navigateur. Aucun secret (`service_role`) ne doit y figurer. Mapbox (si utilisé) : l'usage de ses styles avec MapLibre peut poser un problème de conditions d'utilisation — non vérifié.

## 7. Problèmes encore non résolus / non vérifiés

1. Qualité du satellite, de l'hybride, du topo et du sombre avec une vraie clé : **non vérifiés** (`npm run check:styles`).
2. Recherche et itinéraires avec de vrais services (MapTiler Geocoding, ORS/OSRM) : **non vérifiés**. En particulier : CORS d'ORS depuis le navigateur, profil réellement piéton d'un serveur OSRM.
3. Données Supabase réelles (coordonnées, doublons, réseau piéton, RLS) : **non auditées** (`npm run audit:data` exige vos accès).
4. GPS (`geolocation.ts`), marqueurs aux changements de zoom, mémoire/WebGL sur mobile : **non examinés en navigateur**.
5. Application complète en navigateur ordinateur et mobile : **non testée**.
6. `osm-poi.ts` : la requête Overpass retourne les 200 premiers éléments, pas les plus proches du centre, sans signalement de troncature (limite connue, non corrigée).
7. Les nouveaux comportements d'interface (C5, C6) reposent sur des fonctions testées mais leur intégration React n'a pas de test automatisé.

## 8. Validation

Commandes : `docs/AUDIT_COMMANDES.md` (inclut les étapes de validation manuelle sur le campus).
