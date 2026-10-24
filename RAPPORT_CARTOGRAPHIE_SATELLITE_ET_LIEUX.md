# Rapport — Satellite flou, modes de carte, service de lieux publics

Fournisseur de production indiqué : **MapTiler** (`VITE_MAP_PROVIDER=maptiler`). Aucun accès réseau à
MapTiler ni à Overpass depuis l'environnement de développement (requête de test : HTTP 000), aucun
navigateur : **aucun rendu satellite n'a été vu, aucune requête réelle n'a été faite**. Aucun commit,
déploiement ni migration.

## 1. Diagnostic du flou satellite
Causes **confirmées dans le code** (corrigées) :
- Zoom maximal fixé à la main (19 en satellite/hybride) sans lien avec la résolution réelle de l'imagerie ; au-delà du
  dernier niveau détaillé, MapLibre étire les tuiles (pixels agrandis).
- Sélection d'un lieu, recentrage GPS : zoom forcé à **18 minimum** ; cadrage d'itinéraire jusqu'à 19.
Causes **probables, non vérifiées** (nécessitent le test de `docs/TEST_SATELLITE.md`) :
- Imagerie MapTiler peu détaillée sur Kinshasa au-delà d'un certain niveau (cause la plus vraisemblable).
- Tuiles 256 px sur écrans haute densité ; agrandissement côté serveur non détectable par le client.
Le secours OSM n'est pas une cause de flou (il remplace le satellite par un plan, signalé par la bannière).

## 2. Corrections appliquées
| Fichier | Modification |
|---|---|
| `src/lib/map-config.ts` | Zoom max configurable : `VITE_MAP_MAXZOOM_SATELLITE` / `VITE_MAP_MAXZOOM_VECTOR` (défauts inchangés 19/20) |
| `src/lib/map-resilience.ts` | `effectiveMaxZoom` (limite = min(config, maxzoom déclaré par les sources raster)), `focusZoom` |
| `src/components/CampusMap.tsx` | La limite de zoom s'ajuste au `maxzoom` réel des sources raster ; zooms forcés (sélection, GPS, itinéraire) bornés par cette limite |
| `src/lib/osm-poi.ts` | Requête allégée (`nw`, nom exigé, délai serveur 10 s < client 12 s) ; zone recentrée/limitée à 0,03° au lieu d'une erreur ; **nouvelle tentative unique sur délai dépassé** ; backoff conservé pour 429/5xx/réseau ; miroirs configurables ; **mémorisation 60 s des échecs** ; option `force` |
| `src/pages/MapPage.tsx` | « Réessayer » force réellement une nouvelle requête ; aucune requête sous le zoom 13 (état propre, pas d'erreur) |
| `.env.example`, `docs/TEST_SATELLITE.md`, `docs/RENDER_ENV.md` | Variables et protocole de mesure |
Inchangé volontairement : les ID de style MapTiler (non testables ici), les données, Supabase/RLS.

## 3. Fournisseur par mode (MapTiler, selon `map-config.ts`)
Plan `streets-v2` · Satellite `satellite` · Hybride `hybrid` · Topographique `topo-v2` · Sombre `dataviz-dark`.
**Tous à confirmer avec votre clé.** Réserve : `dataviz-dark` est un fond de visualisation de données, peu adapté à la navigation ; si
MapTiler propose un style de rues sombre sur votre compte, renseignez `VITE_MAP_STYLE_ID_DARK`. Secours : plan OSM raster
(plan uniquement ; satellite/hybride/topo/sombre ne sont pas simulés).

## 4. Variables d'environnement
Requises : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAP_PROVIDER=maptiler`, `VITE_MAP_API_KEY`.
Optionnelles : voir `.env.example` (zoom max, style sombre, Overpass/POI).

## 5. Tests exécutés
Typecheck OK · **72 tests passent** (dont 9 nouveaux : zoom effectif, retry sur 503, cooldown d'échec, « Réessayer » forcé, cache, zone limitée, miroirs, réponse invalide → erreur) · lint 0 erreur (5 avertissements préexistants) ·
build OK avec variables factices.
**Non exécutés :** rendu satellite/plan/hybride/topo/sombre, zoom rapproché, desktop/mobile, panneaux ouverts/fermés, connexion lente ou fournisseur
indisponible, requête réelle Overpass (la lenteur observée en production n'a donc pas été reproduite), GPS réel.

## 6. Restant à faire (clé, terrain, intervention)
1. **Clé API :** la clé a été écrite dans une conversation. Elle n'est dans aucun fichier du projet ; par prudence, la **régénérer** et la restreindre
   à vos domaines (HTTP referrers) chez MapTiler.
2. Faire le test `docs/TEST_SATELLITE.md`, fixer `VITE_MAP_MAXZOOM_SATELLITE`, redéployer. Si l'imagerie MapTiler est trop faible, comparer Esri World Imagery /
   Mapbox ou une imagerie propre au campus (drone) : licences, quotas, clé à vérifier.
3. Vérifier visuellement les 5 modes ; choisir le style sombre.
4. Marqueurs non proportionnels au zoom (pastilles fixes) : **non traité** (structure DOM des marqueurs à auditer avant de les redimensionner sans les déplacer).
5. Changement de style : le fond clignote encore (rechargement complet du style, couches applicatives recréées) : non traité.
6. Coordonnées des bâtiments/entrées : non vérifiables hors base ; lancer `npm run audit:data` puis contrôle terrain.

## 7. Test local puis mise en production
Local : `cp .env.example .env.local`, renseigner les 4 variables requises, `npm ci && npm run dev`, suivre `docs/TEST_SATELLITE.md`, puis `npm run typecheck && npm test && npm run lint && npm run build`.
Production (après votre accord) : variables sur Render, **nouveau déploiement** (lues au build), règle de réécriture SPA, puis la liste de contrôle du rapport d'audit.
