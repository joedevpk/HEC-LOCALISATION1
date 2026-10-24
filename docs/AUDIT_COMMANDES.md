# Commandes de configuration, de vérification et de validation

Aucune clé n'est jamais écrite dans le dépôt : exportez-les dans votre terminal (ou `.env.local`, non versionné).
Les variables `VITE_*` sont intégrées au code envoyé au navigateur : **elles ne sont pas secrètes** ; restreignez
la clé de carte à votre domaine chez le fournisseur et fixez un quota.

## Vérifications locales (sans réseau, sans clé)

```bash
npm ci
npm run typecheck
npm run lint
npm test
VITE_SUPABASE_URL=https://xxxx.supabase.co VITE_SUPABASE_ANON_KEY=... VITE_MAP_PROVIDER=maptiler VITE_MAP_API_KEY=... npm run build
```

## Vérifications avec services réels (à lancer chez vous)

```bash
# 1. Quels identifiants de style répondent sur VOTRE compte MapTiler ?
VITE_MAP_API_KEY=... npm run check:styles

# 2. L'imagerie contient-elle un vrai détail au zoom 18-20 sur le campus ? (heuristique, à confirmer à l'œil)
VITE_MAP_API_KEY=... npm run probe:imagery -- --lng <longitude-campus> --lat <latitude-campus> --zmin 16 --zmax 20

# 3. Données du campus (lecture seule, clé anon)
VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run audit:data
```

Les coordonnées du campus viennent de Supabase ou d'un relevé terrain : aucune valeur par défaut n'est fournie.

## Validation manuelle sur le campus

1. Plan, Satellite, Hybride, Topographique, Sombre : chaque bouton change réellement le fond ; le bouton actif correspond à ce qui est affiché.
2. Zoom maximal en Satellite : les toits/arbres gagnent-ils en détail, ou l'image devient-elle seulement plus floue ? Si floue, fixez `VITE_MAP_MAXZOOM_SATELLITE`.
3. Changer de mode deux fois rapidement avec un itinéraire et des lieux publics affichés : tout réapparaît.
4. Couper la clé (mauvaise valeur sur un déploiement de test) : bandeau de secours honnête, mode actif = Plan.
5. Rechercher une rue et un commerce proches : résultats « hors campus » distincts, carte centrée, fiche affichée.
6. Itinéraire campus → lieu extérieur : tracé réel, distance, durée, étapes en français ; sinon message d'erreur explicite (jamais une ligne droite).
7. Refuser le GPS, puis l'accepter en extérieur : messages clairs, position et précision affichées.
8. Mode avion : tuiles, recherche et itinéraires externes indisponibles — l'application ne se prétend pas hors ligne.

## Vérifications en navigateur réel (sans clé, sans réseau, styles locaux)

```bash
pip install playwright && playwright install chromium
python3 scripts/browser-check/maplibre-style-switch.py      # comportement de MapLibre lui-même
python3 scripts/browser-check/campusmap-integration.py      # vrai composant CampusMap, ordinateur + mobile
```

Ces deux scripts ne testent ni un fournisseur de tuiles, ni le GPS, ni Supabase. Le banc d'essai
`scripts/browser-check/harness/` n'appartient pas à l'application (il n'est pas inclus dans le build).
