# Passe 3 — HEC LOCALISATION (24 octobre 2026) — archive `HEC-LOCALISATION-final-v2.zip`

Base : `HEC-LOCALISATION-cartographie-audit-final.zip` (état après 2 passes d'audit). Seuls 4 éléments diffèrent de cette base (vérifié par `diff -r`).

## Problème traité
Overpass est interrogé avec `out center 200` : au-delà de 200 éléments la réponse est coupée sans tri par distance, des lieux réels pouvaient
manquer sans signalement. La limite n'a PAS été augmentée.

## Fichiers modifiés / ajoutés (liste exhaustive)
1. `src/lib/osm-poi.ts` (modifié)
   - `splitBbox(bbox)` (exporté) : 4 quadrants égaux.
   - Dans `fetchExternalPOIs` : si la 1ʳᵉ réponse atteint `RESULT_LIMIT` → au plus 4 requêtes complémentaires, **séquentielles, sans récursion** (borne : 5 requêtes par zone), via le même `fetchWithRetry` (bascule de serveurs, repos des serveurs en échec : les quadrants suivants échouent sans appel réseau si le serveur est au repos). Fusion + déduplication par id OSM. Zone « complète » seulement si les 4 quadrants sont sous la limite ; sinon `truncated`.
   - **429** : arrêt immédiat des quadrants restants, lieux déjà obtenus conservés. Annulation (`abort`) propagée.
   - `CacheEntry.truncated` ; `isPoiResultTruncated(bbox)` (exporté, respecte le TTL du cache) ; `console.warn` si incomplet.
2. `src/pages/MapPage.tsx` (modifié) : import de `isPoiResultTruncated`, état `poiTruncated`, pastille « Liste de lieux incomplète dans cette zone · zoomez pour affiner » (masquée pendant le chargement ou en cas d'erreur ; remise à faux sous le zoom 13).
3. `src/lib/__tests__/osm-poi-truncation.test.ts` (ajouté) : 5 tests vitest (découpage ; sous la limite ; quadrants complets ; quadrant plein ; 429).
4. `RAPPORT_PASSE3_LIVRAISON.md` (ce fichier, ajouté).
Aucun autre fichier modifié : ni Supabase, ni RLS, ni données, ni styles, ni routage, ni recherche, ni dépendances.

## Vérifications réellement exécutées
- Transpilation TypeScript (syntaxe) des 3 fichiers de code : OK.
- **Banc d'essai Node hors vitest** (`osm-poi.ts` transpilé, `fetch` simulé) : 5 scénarios identiques aux 5 tests → **5 OK / 0 échec** (5 appels réseau simulés pour les quadrants complets, 210 lieux sans doublon ; 2 appels seulement après un 429). Cela prouve la logique sur réponses SIMULÉES, pas le comportement des vrais serveurs Overpass.
- Revue manuelle : exports/imports cohérents (`splitBbox`, `isPoiResultTruncated`, `resetPoiCaches`, `fetchExternalPOIs` ; type de retour de `fetchExternalPOIs` inchangé) ; pas de boucle infinie (boucle bornée à 4) ; pas de doublon (déduplication) ; pas de surcharge (déclenchement seulement quand la limite est atteinte, cache 10 min, repos des serveurs).

## NON exécuté (impossible ici)
`npm ci` échoue : réseau du bac à sable bloqué. Donc **typecheck complet, lint, `npm test` (vitest, y compris les 5 nouveaux tests et les 175 existants), build : NON lancés, aucun résultat à annoncer.** Aucun appel réel à MapTiler, Overpass, géocodage, ORS/OSRM, Supabase ; aucun navigateur ni téléphone ; les 4 modes, la recherche, la fiche et l'itinéraire n'ont pas été retestés.

## À faire sur votre PC
`npm ci && npm run typecheck && npm run lint && npm test && npm run build` ; puis `npm run dev` : zoomer sur une zone dense (≥ 200 lieux) et vérifier la pastille, les 4 modes avec votre clé MapTiler, recherche, fiche, itinéraire, mobile. Variables : aucune nouvelle (`.env.example`). Aucun commit, déploiement, migration ni modification de données.
