# Itinéraire piéton sécurisé — proxy OpenRouteService (Edge Function Supabase)

## Pourquoi
Hébergement actuel : site statique Render + Supabase. Les variables `VITE_*` sont copiées dans le
JavaScript envoyé aux visiteurs : une clé ORS dans `VITE_ROUTING_API_KEY` est donc **publique**.
Solution retenue (aucun nouveau serveur) : une Edge Function Supabase `route-walking` qui garde la clé
dans les **secrets Supabase** et appelle ORS (`foot-walking`) à la place du navigateur.

Fichiers : `supabase/supabase/functions/route-walking/{index.ts,core.ts}` · client : `src/lib/walking-route.ts`.

## Ce que fait la fonction
- Accepte uniquement `POST { from:[lng,lat], to:[lng,lat] }`. Rien d'autre n'est transmis à ORS
  (profil, langue et options sont fixés côté serveur).
- Valide : nombres finis, plages WGS84, pas de (0,0), départ ≠ arrivée, ≤ 25 km, zone autorisée
  (`ROUTING_ALLOWED_BBOX`, défaut `14.0,-6.0,17.0,-3.0` = Kinshasa et région ; `none` pour lever).
- Limite le débit : 20 req/min/IP et 35 req/min au total (plan gratuit ORS : 40/min) → HTTP 429 + `Retry-After`.
  ⚠ Compteurs **en mémoire par instance** : protection de bon sens, pas un quota strict.
- CORS : seules les origines de `ALLOWED_ORIGINS` sont acceptées.
- Authentification : `verify_jwt` actif par défaut ; le navigateur envoie la clé publique *anon* déjà utilisée par l'application.
- Erreurs explicites `{ error: { kind, message } }` : `invalid_points`, `out_of_area`, `too_far`, `no_route`
  (aucun chemin cartographié), `rate_limited`, `not_configured`, `service_misconfigured`
  (clé ORS refusée), `upstream_unavailable`, `timeout`, `bad_request`.
  « Aucun chemin » n'est jamais utilisé pour une panne.
- Une réponse ORS sans géométrie n'est jamais renvoyée comme itinéraire. La clé n'est jamais journalisée
  ni renvoyée (un test automatisé vérifie l'absence de `console.*` et de clé en dur).

## Déploiement (une seule fois)
1. **Renouveler la clé ORS** sur openrouteservice.org (l'ancienne est considérée compromise ; la révoquer).
2. Installer et lier la CLI Supabase (`supabase login`, `supabase link --project-ref <ref>`) depuis le dossier `supabase/`.
3. Secrets :
   ```
   supabase secrets set ORS_API_KEY=<nouvelle clé>
   supabase secrets set ALLOWED_ORIGINS=https://localisationhec.onrender.com
   # optionnels : ROUTING_ALLOWED_BBOX, ROUTING_RATE_PER_IP_PER_MIN, ROUTING_RATE_GLOBAL_PER_MIN
   ```
   Pour tester en local, ajouter `,http://localhost:5173` à `ALLOWED_ORIGINS`.
4. `supabase functions deploy route-walking` (ne pas utiliser `--no-verify-jwt`).

## Configuration Render (Environment)
| Variable | Valeur |
|---|---|
| `VITE_ROUTING_PROVIDER` | `proxy` |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | déjà présentes (l'URL de la fonction en est déduite) |
| `VITE_ROUTING_PROXY_URL` | optionnelle : URL complète si vous n'utilisez pas `<VITE_SUPABASE_URL>/functions/v1/route-walking` |
| `VITE_ROUTING_API_KEY` | **à supprimer** (ignorée en mode `proxy`) |

Puis **relancer un déploiement** (les `VITE_*` sont lues au build).

## Migration depuis l'ancienne configuration
L'ancien mode (`VITE_ROUTING_PROVIDER=ors` + `VITE_ROUTING_API_KEY`) fonctionne toujours : rien ne casse
tant que vous n'avez pas basculé. Ordre sûr : déployer la fonction → tester (ci-dessous) → passer
`VITE_ROUTING_PROVIDER=proxy` → redéployer Render → supprimer `VITE_ROUTING_API_KEY` → révoquer l'ancienne clé ORS.
Retour arrière : remettre l'ancienne valeur et redéployer.

## Validation en production (à faire, non réalisée par l'auteur)
1. Appel direct (remplacer les valeurs ; deux points réels de Kinshasa relevés sur le terrain) :
   ```
   curl -i -X POST "https://<ref>.supabase.co/functions/v1/route-walking" \
     -H "apikey: <ANON>" -H "Authorization: Bearer <ANON>" -H "Origin: https://localisationhec.onrender.com" \
     -H "Content-Type: application/json" -d '{"from":[LNG,LAT],"to":[LNG,LAT]}'
   ```
   Attendu : 200 + GeoJSON ; origine inconnue → 403 ; coordonnées (0,0) → 400 ; hors zone → 422.
2. Dans l'application : calculer 3 trajets réels (depuis le domicile, depuis une adresse recherchée, depuis un point de la carte).
   Comparer la distance affichée à la distance mesurée sur un autre outil.
3. Rechercher le texte de l'ancienne clé dans le JavaScript déployé (onglet Sources/Réseau) : elle ne doit plus apparaître.
4. Tableau de bord Supabase → Edge Functions → Logs : aucune clé visible ; surveiller les 429/5xx.
5. Chemins manquants : un « aucun chemin cartographié » signale un défaut des données OpenStreetMap, pas une panne d'API ;
   consigner le lieu pour correction dans OSM.
