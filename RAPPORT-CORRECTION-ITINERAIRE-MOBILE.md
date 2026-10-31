# HEC Localisation — Correction : l'itinéraire disparaît sur mobile quand on masque le panneau

## 1. Cause exacte
Sur mobile, la feuille basse n'offrait **aucun moyen non destructif de la masquer**. Son seul geste de fermeture
(la croix, « Fermer l'itinéraire ») appelle `closePanel()` dans `MapPage.tsx`, qui efface `selected`, `origin` et
`routeResult` ; la couche MapLibre est alimentée par `routeCoordinates={displayRoute?.coordinates}` et le tracé
disparaît donc avec l'état. Sur ordinateur, le panneau a un état d'affichage séparé (`desktopPanelOpen`) qui ne
touche pas à l'itinéraire : d'où la différence.

Éléments vérifiés et **hors de cause** : « Masquer les étapes » (état local de `RoutePanel`, n'affecte pas le tracé) ;
source/couches GeoJSON (mises à jour par `setData`, jamais détruites par un changement d'affichage) ; instance de
carte (créée une seule fois, vérifiée dans les tests) ; CSS/dimensions (feuille en overlay `absolute`, canvas = conteneur).

Reproduit avant correction (pixels réels, iPhone 13) : tracé 31 956 px → « Masquer les étapes » : inchangé → croix : **0 px**.
Desktop : « Masquer le panneau » : tracé conservé.

## 2. Autres défauts trouvés (corrigés)
- **« Démarrer » n'avait aucun effet visible** : `navigationActive` était activé mais jamais affiché ; la feuille restait ouverte sur la carte.
- **Quitter l'onglet Carte puis revenir effaçait l'itinéraire** (état local de `MapPage` perdu au démontage).
- Pas de redimensionnement/repaint du canvas au retour sur la page (iOS bfcache / retour d'app).

## 3. Fichiers modifiés
- `src/pages/MapPage.tsx` — état `sheetState` (déployée / réduite / masquée), purement visuel ; poignée cliquable ; résumé compact
  (nom, distance, durée, Démarrer/Arrêter) ; pastille de réouverture quand la feuille est masquée ; « Démarrer » réduit la feuille et recentre ;
  mémorisation de la destination (`sessionStorage`) et restauration idempotente au retour sur la carte ; bannière POI remontée au-dessus de la pastille.
- `src/components/RoutePanel.tsx` — props optionnelles `navigationActive` / `onStop` (bouton « Arrêter la navigation », message d'état). Rétro-compatible.
- `src/components/CampusMap.tsx` — `map.resize()` + `triggerRepaint()` sur `visibilitychange` / `pageshow` (listeners nettoyés).
- Ajout : `e2e-itineraire-mobile/` (banc de test réutilisable).
La croix « Fermer l'itinéraire » reste le seul geste qui termine réellement un itinéraire. Rien n'est supprimé ; MapLibre, MapTiler, Supabase et le routage sont inchangés.

## 4. Résultats de vérification (exécutés)
- `tsc` OK · ESLint 0 erreur (5 avertissements préexistants) · Vitest 338/338 · build de production OK.
- Banc e2e réel : **86/86** contrôles sur iPhone 13, Pixel 7 et desktop 1440×900 :
  calcul d'itinéraire → ligne bleue visible → masquer/réafficher les étapes → réduire/agrandir/masquer le panneau (tracé visible à chaque état,
  pastille de réouverture) → Démarrer (navigation active) → quitter la carte et revenir (itinéraire restauré, ligne bleue présente) →
  fermeture explicite (tracé effacé, comportement voulu). Contrôles associés : canvas = conteneur, même instance de carte, aucun débordement
  horizontal, feuille sans chevauchement avec la navigation basse, aucune erreur JS.

## 5. Limites (à dire honnêtement)
- Émulation Chromium d'iPhone 13 / Pixel 7, **pas** de vrais appareils iOS Safari / Android Chrome : un passage rapide sur téléphones réels reste conseillé.
- Fond de carte et Supabase simulés (pas de tuiles MapTiler réelles, pas de vraie base) ; le routage, MapLibre et l'UI sont réels.
- Après « Démarrer », la carte se recentre sur la position (zoom rapproché) : le tracé reste affiché mais seule une partie est dans l'écran. Il n'y a pas de guidage pas-à-pas (non implémenté dans le projet, non ajouté).
- Observé, non traité (hors périmètre) : l'épingle rouge de destination apparaît décalée du point d'arrivée, sur mobile **et** desktop.

---
## Addendum — Message d'échec du service d'itinéraire (capture de production)

**Constat (capture `localisationhec.onrender.com`)** : « Erreur de configuration — Service d'itinéraire introuvable (fonction non déployée ?) ».
C'est un 404 sur `<VITE_SUPABASE_URL>/functions/v1/route-walking` : la fonction Edge `route-walking` n'est pas déployée sur le projet Supabase
(étapes dans `docs/ROUTING_PROXY.md`). Ce n'est pas le bug d'affichage corrigé plus haut, et ce n'est pas réparable dans le code : c'est un déploiement à faire.

**Amélioration apportée (côté visiteur)** — `src/lib/route-failure.ts`, `src/pages/MapPage.tsx` :
- Titre « Itinéraire pas encore disponible ici » (au lieu de « Erreur de configuration »).
- Plus de jargon pour le visiteur : le texte technique (« fonction non déployée ? », jeton, origine…) n'est montré qu'aux **administrateurs**
  (avec renvoi vers `docs/ROUTING_PROXY.md`).
- Piste d'action réelle : « Choisissez un lieu du campus comme point de départ ci-dessous, ou revenez plus tard » — vérifiée : ce départ calcule bien
  l'itinéraire sur le réseau interne et le tracé bleu s'affiche.
- Invariants conservés : une erreur de configuration n'est jamais présentée comme « réseau » ni « réessayable » ; les autres échecs (réseau, indisponible,
  introuvable) ne sont pas réécrits ; aucun tracé fictif.

**Vérification** : Vitest 345/345 (7 tests ajoutés) · tsc OK · ESLint 0 erreur · e2e précédent 86/86 (non-régression) ·
nouveau test navigateur sur **build de production**, service simulé en 404 puis 503 : 6/6 (`e2e-itineraire-mobile/run_service_errors.py`).

**Toujours à faire par vous** : déployer `route-walking` (secrets `ORS_API_KEY`, `ALLOWED_ORIGINS`), puis tester un vrai trajet hors réseau interne
sur téléphone. Le chemin « service externe en succès » n'a pas pu être testé ici (clé ORS réelle requise).
