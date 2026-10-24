# Sources cartographiques, licences, clés — HEC Localisation

Chaque composant a un rôle distinct ; ils ne sont pas interchangeables.

| Besoin | Composant | Source retenue | Config |
|---|---|---|---|
| Fond routier (Plan, Topo, Sombre) | styles vectoriels | MapTiler (données © OpenStreetMap) | `VITE_MAP_PROVIDER=maptiler`, `VITE_MAP_API_KEY` |
| Imagerie (Satellite, Hybride) | tuiles raster | MapTiler (imagerie sous licence MapTiler / ses fournisseurs) | idem ; zoom utile : `docs/TEST_SATELLITE.md` |
| Bâtiments/salles du campus | données applicatives | Supabase (tables existantes) | `VITE_SUPABASE_*` |
| Lieux publics proches | requêtes OSM | Overpass API | `VITE_OVERPASS_*`, `VITE_POI_*` |
| **Recherche de rues/établissements** | géocodage | MapTiler Geocoding (même clé) ; sinon Nominatim sur demande explicite | `VITE_GEOCODER` |
| Itinéraire sur le campus | graphe `route_nodes/route_segments` + A* | données du campus | admin |
| **Itinéraire hors campus** | moteur de routage piéton | openrouteservice (`foot-walking`) ou OSRM auto-hébergé (`foot`) | `VITE_ROUTING_*` |
| Secours du fond | tuiles raster OSM | tile.openstreetmap.org (plan seulement, signalé) | automatique |

## Licences et attributions
- Données OpenStreetMap : ODbL, attribution « © contributeurs OpenStreetMap » (affichée par la carte et sous les résultats de recherche).
- Chaque fournisseur impose sa propre attribution (affichée par MapLibre depuis la source) : ne pas la masquer.
- **À vérifier par vous sur vos comptes (non vérifiable ici)** : le plan MapTiler utilisé (quotas, usage commercial/institutionnel autorisé, règles de
  conservation des résultats de géocodage — l'application ne garde les résultats qu'en mémoire 10 minutes) ; le quota du plan openrouteservice.
- Nominatim public : usage léger uniquement (1 requête/s, pas d'autocomplétion, application identifiable) ; le code s'y conforme (déclenchement manuel, cadence limitée).
- Serveur OSRM de démonstration public : voiture seulement, démonstration uniquement. Ne pas l'utiliser en production.
- Overpass public : usage raisonnable ; le code limite zone, fréquence et nouvelles tentatives.

## Clés API et restrictions
Toutes les clés `VITE_*` sont **visibles dans le navigateur**. Restreignez-les par domaine (HTTP referrers) chez chaque fournisseur, surveillez les quotas,
et régénérez toute clé qui a été partagée dans une conversation. Aucune clé secrète (service_role, etc.) ne doit être dans une variable `VITE_*` ni dans Git.

## Données du campus manquantes (constat sur le dépôt)
Le dépôt ne contient aucune coordonnée réelle de bâtiment, d'entrée ni de chemin : tout vient de la base de production. À vérifier avec
`npm run audit:data` puis sur le terrain : coordonnées des bâtiments et entrées, `route_nodes`/`route_segments` (réseau piéton connecté, entrées raccordées),
salles, services, toilettes/bibliothèques en tant que lieux (`kind`/`category`). Les chemins du campus doivent être relevés/validés par l'administration.
