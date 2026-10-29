# Routage intérieur — audit et architecture cible (NON ACTIVÉ)

**État réel : le routage intérieur n'est PAS fonctionnel.** Aucun couloir, escalier, ascenseur ou étage n'est
inventé ni présumé. Tant qu'un réseau validé n'existe pas, l'application affiche une limitation explicite.

## Audit de l'existant (lecture du code et des migrations)
- `route_nodes` (type : entrance, intersection, corridor, stairs, elevator, ramp, poi) et `route_segments`
  (distance, accessible, segment_type) existent (migration `20260827090000`), avec lecture publique et écriture admin.
- Manque pour un usage intérieur : aucun lien nœud → bâtiment / étage ; aucune notion de statut de validation ni de
  source ; `route_nodes` n'a qu'un lng/lat (pas de niveau) ; un éditeur admin de réseau existe (`AdminRouteEditor.tsx`)
  mais ses données ne sont pas qualifiées.
- Les bâtiments/salles portent désormais un statut de validation (migration passe 1, `20261026090000`).
- Le moteur (`src/lib/nav.ts`) calcule sur le graphe disponible et renvoie une erreur explicite s'il est absent
  (`ROUTE_NETWORK_MISSING`) : il n'invente pas de tracé.

## Architecture proposée (additive — `supabase/proposals/PROPOSITION_indoor_network.sql`, non appliquée)
1. Rattacher les nœuds à `building_id` et `floor_id` ; ajouter `verification_status`, `verified_at/by`, `data_source`.
2. Un segment inter-étages n'est valide que de type `stairs` / `elevator` / `ramp` entre deux nœuds de niveaux différents.
3. Le moteur n'utilise que les nœuds/segments `validated` et non archivés (filtre à implémenter côté `nav.ts` et en RLS de lecture publique).
4. Entrées : nœuds `entrance` validés = points d'accrochage entre le réseau extérieur (ORS) et l'intérieur.
5. Collecte : relevé sur plans institutionnels + vérification sur place ; chaque connexion validée par un administrateur.
6. Diagnostic admin : bâtiments sans entrée validée, nœuds isolés, composantes non connectées
   (`supabase/supabase/diagnostics/audit_indoor_readiness.sql`, lecture seule).

## Critères avant d'annoncer « routage intérieur disponible »
Plans reçus · entrées et connexions relevées et validées · graphe connexe par bâtiment · test sur le terrain d'au moins
un trajet par bâtiment · UI affichant la limite pour tout bâtiment non couvert.
