# HEC Localisation — Masquer la feuille « Itinéraire » sur mobile sans perdre le tracé (passe 6)

## 0. Reconnaissance d'une erreur de ma passe précédente
Le correctif annoncé « validé » (86 tests) ne corrigeait pas le geste réel de l'utilisateur. Mes tests n'avaient ni le trajet **externe** depuis
une position hors campus, ni « Section Informatique », ni le geste « toucher la croix ». Je les avais validés sur un parcours campus interne,
en utilisant des boutons que l'utilisateur ne voit pas. Ce rapport remplace le précédent.

## 1. Cause exacte (reproduite)
Reproduit sur build de production, trajet externe, destination « Section Informatique » (`repro_x.py`, code précédent) :
tracé calculé = 12 829 px de bleu → toucher la croix en haut à droite de la feuille → **0 px**.
- La feuille déployée n'offrait qu'**une seule commande de sortie visible : la croix « Fermer l'itinéraire »**, qui appelle `closePanel()`
  (`MapPage.tsx`) : efface `selected`, `routeResult`, l'erreur, la navigation, et le tracé avec.
- Mon « Masquer » n'existait que dans l'état *réduit*, atteignable par la poignée (zone de 8 px, invisible comme bouton). L'utilisateur ne le voyait pas.
- Desktop : le panneau a son propre bouton de masquage (`desktopPanelOpen`), séparé de l'itinéraire, d'où la différence.

**Second défaut trouvé** : quand le GPS bouge de plus de 40 m (utilisateur qui marche), le recalcul effaçait l'ancien tracé le temps de la réponse
du service, et l'état « masqué » de la feuille dépendait de la présence du tracé : la feuille se rouvrait seule et le tracé clignotait.

Éléments hors de cause (vérifiés) : sources/couches GeoJSON (jamais détruites par un changement d'affichage), instance de carte (même canvas dans tous les
états), dimensions du canvas, CSS, effets React du panneau, nombre d'appels au service (aucun recalcul au masquage).

## 2. Corrections
Trois états **indépendants** de la feuille (`sheetState` : déployée / réduite / masquée), purement visuels ; destination, départ, `routeResult`, `displayRoute`,
marqueurs, source GeoJSON, navigation ne sont jamais touchés par eux.

| Commande | Effet | Où |
|---|---|---|
| Réduire (chevron ⌄) | résumé compact : destination, distance, durée, Démarrer | en-tête de la feuille |
| Masquer (œil barré) | cache **uniquement** le panneau | en-tête de la feuille / barre réduite |
| Afficher l'itinéraire | rouvre le panneau existant | bouton flottant, au-dessus de la navigation basse (distance/durée en 2ᵉ ligne) |
| Arrêter la navigation | arrête le mode navigation, **ne** supprime **pas** le trajet | panneau / barre réduite |
| Fermer l'itinéraire (explicite) | **seul** geste destructif : efface trajet et marqueurs | bouton étiqueté en bas du panneau |

La croix destructive de l'en-tête **n'existe plus** sur la feuille mobile : un geste rapide ne peut plus effacer l'itinéraire.

## 3. Fichiers et fonctions modifiés
- `src/components/RoutePanel.tsx` — props optionnelles `onCollapse`, `onHide` (en-tête non destructif) ; bouton « Fermer l'itinéraire » explicite ;
  `navigationActive` / `onStop` (« Arrêter la navigation »). Sans ces props, comportement identique à avant (desktop inchangé).
- `src/pages/MapPage.tsx` — `sheetState`/`mobileSheetMode` indépendants de la présence du tracé ; résumé compact ; bouton flottant « Afficher l'itinéraire » ;
  `startNavigationMobile` ; conservation de l'ancien tracé pendant un recalcul dû au GPS (même destination) ; mémorisation et restauration idempotente de la
  destination au retour sur la carte (`sessionStorage`) ; bannière de lieux publics remontée au-dessus du bouton.
- `src/components/CampusMap.tsx` — `map.resize()` + `triggerRepaint()` à `visibilitychange`/`pageshow` (écouteurs nettoyés ; aucune donnée détruite).
- `src/lib/route-failure.ts` (+ tests) — message d'échec du service d'itinéraire lisible par un visiteur, détail technique réservé aux administrateurs.
- Ajout : `e2e-itineraire-mobile/`.
Aucun changement : MapLibre, MapTiler, fournisseur de routage, Edge Functions, migrations SQL.

## 4. Tests exécutés (résultats réels)
**Scénario de production** (`run_prod_scenario.py`, build Vite, service externe simulé en succès, GPS hors campus, recherche « Section Informatique ») — **83/83** sur iPhone 13, Pixel 7, desktop 1440×900 :
1 ouverture · 2 géolocalisation · 3 destination · 4 calcul externe (1 seul appel) · 5 tracé bleu · 6 masquer · 7 tracé visible, aucun nouvel appel, bouton « Afficher l'itinéraire » visible,
dans l'écran, sans chevaucher la navigation · 7b GPS qui bouge de ~90 m feuille masquée : tracé jamais absent, feuille reste masquée, recalcul unique · 8 rouvrir · 9 réduire/agrandir ·
10 Démarrer · 11 masquer/rouvrir en navigation, navigation conservée · Arrêter la navigation : trajet conservé · 12 quitter la carte · 13 retour : itinéraire restauré, tracé présent ·
14 fermeture définitive : le tracé disparaît **uniquement** là. Contrôles associés : même instance de carte, canvas = conteneur, pas de débordement horizontal, aucune erreur JS.
Autres : parcours campus interne en serveur de dev **86/86** · échec du service (404/503) en visiteur **6/6** · Vitest **345/345** · tsc OK · ESLint 0 erreur (5 avertissements préexistants) · build de production OK.

## 5. Limites (à lire)
- **Chromium uniquement** (émulation iPhone 13 / Pixel 7). WebKit/Safari iOS n'est pas installable ici : le comportement Safari réel (barre d'adresse dynamique, bfcache, GPS) n'est pas prouvé. **Test indispensable sur votre iPhone après déploiement.**
- Service d'itinéraire, Supabase et fond de carte **simulés** (aucune clé OpenRouteService ni tuile réelle) ; les coordonnées de test sont fictives, **uniquement** dans le banc de test, jamais dans l'application.
- À l'ouverture d'un trajet, la feuille déployée recouvre une partie du tracé (cadrage inchangé) ; il apparaît en entier en masquant la feuille. Non modifié.
- Après « Démarrer », la carte se recentre sur la position (zoom rapproché) ; pas de guidage pas à pas dans le projet.
- Observé, non traité : l'épingle rouge de destination apparaît décalée du point d'arrivée (mobile et desktop, existait avant).

## 6. Redéployer sur Render
1. Remplacer le code par ce zip (commit + push sur la branche suivie par Render ; déploiement auto) ou, depuis Render : **Manual Deploy → Clear build cache & deploy**.
2. Aucune variable d'environnement nouvelle. Les `VITE_*` sont lues à la construction : si vous les changez, relancez un déploiement.
3. **Cache PWA** : l'application a un service worker (mise à jour automatique, appliquée au rechargement). Sur l'iPhone : fermer complètement l'onglet, rouvrir la page, **recharger deux fois**.
   En cas de doute : Réglages → Safari → Avancé → Données de sites web → supprimer `localisationhec.onrender.com`.
4. Vérifier que la nouvelle version tourne : dans la feuille « Itinéraire », l'en-tête doit montrer **deux icônes (⌄ et œil barré)** et **plus de croix** ; un bouton « Fermer l'itinéraire » doit apparaître **en bas** du panneau.
5. Itinéraire hors réseau interne : la fonction Edge `route-walking` doit être déployée (`docs/ROUTING_PROXY.md`) — déjà le cas dans votre capture (trajet openrouteservice affiché).
