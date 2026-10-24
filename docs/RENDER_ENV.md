# Vérifications à faire dans le tableau de bord Render (et chez le fournisseur de carte)

> Ce document ne décrit pas l'état réel de la production : il n'a pas été possible
> d'accéder à Render, à Supabase ni au fournisseur de carte. Ce sont des points à
> **vérifier**, pas des constats.

## 1. Variables d'environnement (Render → service → Environment)
| Variable | Attendu | Si absente / fausse |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<projet>.supabase.co` | l'application ne démarre pas (erreur de configuration) |
| `VITE_SUPABASE_ANON_KEY` | clé **publique** « anon » | idem ; ne jamais y mettre `service_role` |
| `VITE_MAP_PROVIDER` | `maptiler`, `mapbox`, `esri` ou `custom` | écran « carte non configurée » (message explicite) |
| `VITE_MAP_API_KEY` | clé du fournisseur (sauf `custom`) | idem |
| `VITE_MAP_STYLE_ID_<MODE>` | optionnel | les ID de style par défaut de `map-config.ts` s'appliquent |

**Piège principal :** ces variables sont lues **au build**. Après modification, lancez un
nouveau déploiement ; un simple redémarrage ne change rien.

Ne présumez pas que `.env.example` reflète Render : comparez variable par variable.

## 2. Fournisseur de carte
- La clé est visible dans le navigateur : **restreignez-la à votre domaine**
  (`localisationhec.onrender.com` et le domaine final) dans le tableau de bord du fournisseur.
  Une restriction mal saisie renvoie HTTP 403 → la carte bascule sur le fond de secours.
- Vérifiez quota et plan (un dépassement renvoie HTTP 429).
- Vérifiez que chaque identifiant de style par défaut existe pour votre compte
  (surtout `satellite`, `dark` pour MapTiler ; `hybrid`/`dark` pour Esri). Un identifiant
  inexistant donne une erreur 404 sur `style.json`.

## 3. Réécriture SPA (rafraîchir `/map`, `/auth`… ne doit pas donner 404)
`public/_redirects` est une syntaxe **Netlify/Cloudflare Pages** ; Render ne la lit pas.
Sur un « Static Site » Render, ajoutez dans *Redirects/Rewrites* :
`/*` → `/index.html` de type **Rewrite**. À tester en rafraîchissant `/map`.

## 4. Supabase
- Les migrations de `supabase/supabase/migrations/` sont-elles toutes appliquées en production
  (en particulier `20260903090000_archive_campus_entities.sql`) ?
- Voir `supabase/proposals/PROPOSITION_archived_rls.sql` (non appliquée, à valider).
- Authentication → URL Configuration : le domaine Render y figure-t-il (redirections de connexion) ?

## 5. Variables carte et lieux publics ajoutées
`VITE_MAP_MAXZOOM_SATELLITE`, `VITE_MAP_MAXZOOM_VECTOR`, `VITE_MAP_STYLE_ID_<MODE>`, `VITE_OVERPASS_*`, `VITE_POI_*`
(toutes optionnelles, voir `.env.example`). Procédure de mesure : `docs/TEST_SATELLITE.md`.
