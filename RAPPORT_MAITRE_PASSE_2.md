# Rapport — Passe 2 : routage réel et sécurisé

Verdict : **code livré et testé en simulation ; NON validé en conditions réelles.** Aucun appel réel à ORS, Supabase ni Render n'a été effectué (pas de clé, pas d'accès). Les trajets réels à Kinshasa restent à tester (procédure dans `docs/ROUTING_PROXY.md`).

## Audit
- Hébergement : site statique Render + Supabase, aucun backend applicatif → le proxy le plus compatible est une **Edge Function Supabase**.
- Clé ORS : `VITE_ROUTING_API_KEY` est embarquée dans le JavaScript public (mode hérité). À renouveler.
- Départs existants : GPS, lieu du campus, point sur la carte. **Manquait : l'adresse recherchée.**
- Routage intérieur : aucun lien nœud↔bâtiment/étage, aucune validation de données → non activable.

## Réalisé
1. **Proxy** `supabase/supabase/functions/route-walking/` : validation stricte, zone configurable, limite de débit (par IP + globale), CORS restreint, erreurs typées (`no_route` distinct des pannes), clé uniquement dans les secrets serveur, aucune réponse vide transmise comme itinéraire.
2. **Client** (`walking-route.ts`) : mode `VITE_ROUTING_PROVIDER=proxy` ; l'ancien mode `ors` fonctionne toujours (migration sans rupture) ; la clé VITE est ignorée en mode proxy. Distance : si le total annoncé s'écarte de plus de 25 % de la géométrie renvoyée, la géométrie fait foi. Durée toujours « ≈ … (estimé) ».
3. **Cohérence des tracés** : le tracé précédent n'est conservé que pour le même couple départ-destination (départ à moins de 40 m) ; sinon effacé. Réponses obsolètes : annulation par AbortController (testée).
4. **Départ par adresse** (`OriginAddressSearch.tsx`) : seuls les résultats avec coordonnées valides sont proposés ; confirmation explicite obligatoire ; mention « approximatif » (quartier, rue, commune) ou « précision non communiquée ». Aucun géocodage présumé.
5. **Routage intérieur préparé, non activé** : `docs/ROUTAGE_INTERIEUR.md`, `supabase/proposals/PROPOSITION_indoor_network.sql` (non appliquée), `diagnostics/audit_indoor_readiness.sql` (lecture seule).

## Tests
Avant : 186. Après : **238** (typecheck OK, lint 0 erreur / 6 avertissements existants, build OK). Les 186 existants passent sans modification de leurs assertions. +52 tests : proxy (validation, 401/403, 429, 404, 2004, 5xx, débit, CORS, absence de clé), client proxy (succès, HTTP 4xx/5xx, réseau, abort, changement de destination), précision du géocodage, couple départ-destination. Les 6 tests de `route-session` (passe 1) ont été réécrits pour la règle plus stricte du couple départ-destination (même nombre). La fonction Edge a été vérifiée par `tsc --strict` isolé, **pas exécutée sous Deno**.

## Fichiers
Nouveaux : `supabase/supabase/functions/route-walking/{core,index}.ts`, `src/components/OriginAddressSearch.tsx`, 3 fichiers de tests, `docs/ROUTING_PROXY.md`, `docs/ROUTAGE_INTERIEUR.md`, proposition + diagnostic SQL.
Modifiés : `src/lib/walking-route.ts`, `route-session.ts`, `geocoding.ts`, `src/pages/MapPage.tsx`, `src/components/RoutePanel.tsx`, `.env.example`, `docs/RENDER_ENV.md`, test `route-session`.
Aucune migration exécutée ; aucune opération destructive.

## À faire par vous (prérequis)
1. Renouveler la clé ORS et révoquer l'ancienne. 2. Déployer la fonction + secrets (`ORS_API_KEY`, `ALLOWED_ORIGINS`). 3. Basculer Render sur `proxy`, redéployer, supprimer `VITE_ROUTING_API_KEY`. 4. Exécuter la validation de production. 5. Exécuter la migration de la passe 1 si pas déjà fait.

## Limites restantes
- Limiteur de débit en mémoire par instance (pas un quota strict).
- La recherche d'adresses dépend de la clé MapTiler/Nominatim déjà configurée ; sans elle, l'option est désactivée avec message.
- Qualité des chemins piétons à Kinshasa = données OpenStreetMap : non vérifiée.
- « Lieu institutionnel validé » comme départ : la liste des lieux est utilisée, mais le filtre sur le statut `validated` n'est pas branché dans l'UI.
- Passe 1 : responsive testé par lecture, administration/import/photos/RLS toujours à faire.
