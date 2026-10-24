# Rapport — HEC Localisation : recherche géographique réelle et itinéraires hors campus

Complète les rapports précédents. Aucun commit, déploiement ni migration ; Supabase/RLS/rôles inchangés.
**Limite :** pas de navigateur et pas d'accès réseau aux fournisseurs (MapTiler, openrouteservice, Overpass, Nominatim) depuis l'environnement de développement.
Les nouveaux services ont été testés avec des réponses **simulées** au format documenté des fournisseurs ; **aucun appel réel n'a été fait et aucun rendu n'a été observé**.

## 1. Audit de l'existant (avant modification)
- Carte : MapLibre via `CampusMap.tsx` ; fond MapTiler (selon votre configuration) avec secours OSM ; 5 modes.
- Recherche : **uniquement les lieux du campus** (Supabase). Aucune recherche de rues, d'établissements ou de lieux publics hors données chargées.
- Lieux publics : Overpass (affichés sur la carte, non cherchables).
- Itinéraires : A* sur le graphe du campus (`route_nodes/route_segments`). Hors réseau → erreur honnête (pas de ligne fictive) ; pour un lieu public, simple lien vers openstreetmap.org dans un autre onglet.
- Campus (Supabase) obligatoire pour afficher la carte : s'il est indisponible, la carte entière disparaissait.

## 2. Ajouts et corrections
| Fichier | Rôle |
|---|---|
| `src/lib/geocoding.ts` (+ tests) | Recherche réelle : MapTiler Geocoding (même clé que la carte, suggestions pendant la frappe) ou Nominatim (déclenchement manuel, 1 req/s). Biais sur le campus, pays `cd`, langue `fr`, cache 10 min, délai 8 s, annulation, erreurs distinguées (accès refusé, quota, délai, réseau, réponse invalide). Aucun résultat fabriqué. |
| `src/lib/use-place-search.ts`, `src/components/PlaceSearchSection.tsx` | Saisie différée (450 ms, ≥ 3 caractères), états chargement / erreur avec « Réessayer » / aucun résultat / non configuré, attribution. L'erreur reste locale : la recherche du campus et la carte continuent de fonctionner. |
| `src/lib/walking-route.ts` (+ tests) | Itinéraire **piéton** réel : openrouteservice (`foot-walking`) ou votre OSRM (`foot`). Tracé suivant les chemins OSM, distance, durée, étapes en français. Refuse points invalides ou trajet > 25 km ; erreurs explicites (non configuré, aucun chemin, quota, accès refusé, délai). |
| `src/pages/MapPage.tsx` | Sélection d'un résultat → déplacement de la carte + pastille + fiche ; bouton « Itinéraire » **dans l'application** (si moteur configuré) ; repli automatique sur le moteur externe quand le réseau du campus ne peut pas servir le trajet (aucun calcul externe si le campus peut le faire) ; départ retardé de 400 ms, annulation, pas de nouveau calcul tant que le départ bouge de moins de 40 m (protège le quota) ; message honnête si le moteur n'est pas configuré ; carte générale si Supabase est indisponible (voir §4). |
| `src/components/LocationSearch.tsx`, `ExternalPOIDetail.tsx`, `RoutePanel.tsx`, `lib/nav.ts`, `lib/poi-categories.ts` | Ajouts non destructifs (section sous les résultats, bouton d'itinéraire interne, badge « calculé par … — vérifiez sur place », champ `source` d'un itinéraire). |
| `src/lib/map-resilience.ts` | `readFallbackCampus` : centre de secours **fourni par l'administration**, jamais inventé. |
| `.env.example`, `docs/CARTOGRAPHIE_SOURCES.md` | Variables, sources, licences, clés. |

## 3. Sources retenues
Voir `docs/CARTOGRAPHIE_SOURCES.md` (tableau fond routier / imagerie / bâtiments / lieux / recherche / routage / secours, avec licences et restrictions).
Choix de routage : **openrouteservice** (clé, profil piéton réel) ou **OSRM auto-hébergé**. Le serveur OSRM de démonstration public n'a pas été retenu (voiture seule, démonstration uniquement).

## 4. Supabase indisponible
Si `VITE_FALLBACK_CENTER_LNG/LAT` sont renseignés (centre réel choisi par vous), la carte générale s'affiche avec une bannière claire : fond, recherche de lieux, lieux publics, GPS,
itinéraires hors campus. Sans ces variables, l'écran d'erreur précédent est conservé. Les bâtiments/salles du campus ne s'affichent évidemment pas tant que la base est injoignable.

## 5. Tests exécutés
Typecheck OK · **92 tests passent** (dont 27 nouveaux : configuration, parseurs MapTiler/Nominatim/ORS/OSRM, rejet des coordonnées invalides et réponses malformées, cache, annulation,
accès refusé/quota/panne, points invalides/trajet trop long, en-têtes/URL des requêtes, centre de secours) · lint 0 erreur (5 avertissements préexistants) · build OK avec variables factices.
**Non exécutés :** tout appel réel aux fournisseurs ; rendu des 5 modes ; recherche et itinéraire de bout en bout dans un navigateur ; mobile/desktop ; GPS réel ; connexion lente ;
changement de style avec itinéraire affiché (le code recrée les couches, comportement non observé) ; parcours Supabase.

## 6. Ce qui reste à faire / à configurer
1. **Restreindre et, si besoin, régénérer** la clé MapTiler (partagée en conversation) ; vérifier que votre plan MapTiler couvre le géocodage et votre usage institutionnel.
2. **Routage hors campus :** créer une clé openrouteservice et définir `VITE_ROUTING_PROVIDER=ors` + `VITE_ROUTING_API_KEY` (ou héberger OSRM). Sans cela, les trajets hors campus affichent un message explicite. Vérifier que ces services acceptent les requêtes navigateur depuis votre domaine (CORS) : non testé.
3. **Format des réponses :** les parseurs suivent le format documenté de MapTiler Geocoding/ORS/OSRM tel que je le connais ; à confirmer par un premier essai réel (un format différent produit un message « réponse invalide », jamais de faux résultat).
4. **Données du campus manquantes** (à relever/valider sur le terrain) : voir `docs/CARTOGRAPHIE_SOURCES.md` ; lancer `npm run audit:data`.
5. **Zoom satellite** : `docs/TEST_SATELLITE.md`. **Style sombre** : confirmer ou remplacer `dataviz-dark`.
6. Non traités : taille des marqueurs selon le zoom ; clignotement lors du changement de style ; recalcul automatique **externe** pendant le guidage (le recalcul hors itinéraire n'utilise que le réseau du campus : le dernier tracé externe est conservé) ; calcul d'itinéraire externe pour plusieurs étapes.

## 7. Validation locale
`cp .env.example .env.local`, renseigner Supabase + carte (+ routage), `npm ci && npm run dev`. Puis : (1) Plan/Satellite/Hybride/Topo/Sombre ; (2) taper « pharmacie » ou un nom de rue → suggestions, sélection → carte déplacée, fiche ;
(3) « Itinéraire » vers ce lieu avec GPS autorisé → tracé suivant des rues, distance/durée, badge « calculé par … » ; (4) couper le réseau : messages locaux, carte intacte ; (5) bloquer `api.maptiler.com` : bannière de secours ;
(6) `npm run typecheck && npm test && npm run lint && npm run build`. Mise en production uniquement après votre accord (variables Render, nouveau déploiement, voir `docs/RENDER_ENV.md`).
