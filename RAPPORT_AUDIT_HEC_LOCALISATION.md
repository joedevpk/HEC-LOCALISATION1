# Rapport d'audit et de correction — HEC Localisation

Périmètre : dépôt fourni (`HEC-LOCALISATION1-main`). Aucun accès à Render, Supabase, au fournisseur de carte
ni à un appareil réel. Aucun commit, aucun déploiement, aucune migration appliquée.

**Limite de cet audit :** la carte a été analysée par lecture du code et tests unitaires. La cause exacte du
rendu « peu professionnel » en production **n'a pas pu être constatée** : elle dépend du fournisseur, de la
clé et du style réellement configurés sur Render (voir §6). Ce rapport ne promet pas un rendu équivalent à
Google Maps.

## 1. Problèmes constatés et preuves

### Critique
| # | Constat | Preuve |
|---|---|---|
| C1 | **Le secours cartographique ne se déclenchait pas avec un fournisseur vectoriel.** Les erreurs n'étaient traitées que si `sourceId` valait `base` ou `reference`. Les styles MapTiler/Mapbox/Esri nomment leurs sources autrement. | `CampusMap.tsx` (ancien gestionnaire `map.on('error')`) ; test de non-régression `map-resilience.test.ts` |
| C2 | **Un refus d'accès (clé invalide, domaine non autorisé, quota : HTTP 401/403/429) était traité comme une panne passagère** (4 échecs requis), et une erreur de police/glyphes (sans `sourceId`) comptait comme panne de tuiles → secours possible à tort. | idem |

### Important
| # | Constat | Preuve |
|---|---|---|
| I1 | L'utilisateur n'était **jamais prévenu** d'un fond dégradé (bannière réservée aux admins/DEV) ; les boutons Satellite/Hybride restaient « actifs » alors que le plan OSM standard s'affichait. | `MapPage.tsx` (ancien `isAdminRole(...) \|\| DEV`) |
| I2 | `getMapViewOptions()` n'était **jamais appliqué** (son commentaire le reconnaît) : pas de zoom min/max, cap, inclinaison, antialias définis à la création de la carte. | `grep getMapViewOptions src` → aucune utilisation hors `map-config.ts` |
| I3 | Message d'erreur trompeur : une carte **non configurée** (`MapConfigError`) affichait « Vérifiez votre connexion internet ». | `MapPage.tsx` (ancienne description fixe) |
| I4 | Le compteur de clusters utilisait la police codée en dur `Noto Sans Bold` : absente chez certains fournisseurs, et le fond de secours raster n'a pas de serveur de glyphes (couche en erreur). | `CampusMap.tsx` `addPoiLayers` |
| I5 | Les archives (`archived_at`) ne sont filtrées que **côté client** ; les policies publiques sont restées `USING (true)` alors que le commentaire de migration annonce « caché du public ». Lisible via l'API avec la clé publique. | migrations `20260903090000…` et `20260827090000…` |
| I6 | Étiquettes de bâtiments (jusqu'à 120 px chacune) qui se chevauchent à faible zoom. | `CampusMap.tsx` `buildingMarkerEl` |

### Amélioration / à tester
- `.env.example` contenait des valeurs ressemblant à des fragments (`httpsxxxxx`) ; `README.md` est vide.
- `public/_redirects` (syntaxe Netlify/Cloudflare) n'est pas lue par Render : le rafraîchissement d'une route peut donner 404 selon la configuration Render (**non vérifié**).
- `schedules` (noms d'enseignants) et `qr_codes` sont lisibles publiquement par conception de la migration : décision de confidentialité à valider par la Direction.
- Exports `getSourceConfig`, `isDefaultProvider`, `BASE_SOURCE_IDS` non utilisés (code mort conservé, rien supprimé).
- 5 avertissements lint `react-refresh/only-export-components` (préexistants, sans effet fonctionnel).

### Vérifié positif (par lecture du code, non exécuté en conditions réelles)
RLS activé sur les 17 tables ; protection contre l'auto-promotion de rôle (migration `20260826210000`) ; lecture/écriture admin via `is_campus_admin()` ; données privées exclues du cache PWA (liste blanche) ; itinéraire impossible → `RouteError` explicite, **aucune ligne fictive** (`nav.ts`) ; assistant clairement annoncé comme non-IA ; page « Tarifs » honnête (aucun paiement) ; thème sombre anti-flash et bouton afficher/masquer le mot de passe présents.

## 2. Corrections appliquées
- **C1/C2** : nouveau module pur `map-resilience.ts` (classification `app / asset / persistent / transient`, décision ignorer / secours / signaler). 401/403/429 → secours immédiat ; échecs réseau → secours après 4 échecs consécutifs sans tuile chargée ; erreurs de police/sprite/sources applicatives ignorées. Toute source du fond remet le compteur à zéro.
- **I1** : bannière de secours visible par **tous**, nommant le mode indisponible, avec bouton « Réessayer le fond de carte » ; détail technique (clé/domaine/quota) réservé aux admins ; en secours, seul « Plan » est affiché actif.
- **I2** : options de vue appliquées à la création (`minZoom 2`, `maxZoom` selon le mode, `pitch 0`, `bearing 0`, `antialias false`) et `maxZoom` mis à jour au changement de mode.
- **I3** : `onMapError(message, kind)` ; message adapté si configuration (« contactez l'administration »).
- **I4** : police reprise du style du fournisseur (`pickTextFont`) ; couche de compteur non ajoutée si le style n'a pas de glyphes.
- **I6** : à zoom < 17 les pastilles de bâtiments se réduisent à leur code (aucun marqueur retiré).
- **Données** : `campus-audit.ts` + `npm run audit:data` (lecture seule) : coordonnées invalides/(0,0), points hors zone (1500 m par défaut), doublons, entrées manquantes, segments vers nœuds inexistants, réseau découpé, nœuds isolés, lieux non raccordables. **Ne déplace ni ne crée aucune donnée.**
- **I5** : script **non appliqué** `supabase/proposals/PROPOSITION_archived_rls.sql` (avec retour arrière et risques).
- Documentation : `docs/RENDER_ENV.md`, `.env.example` clarifié.

## 3. Fichiers modifiés
`src/components/CampusMap.tsx`, `src/pages/MapPage.tsx`, `src/index.css`, `package.json` (script `audit:data`), `.env.example` ·
Nouveaux : `src/lib/map-resilience.ts`, `src/lib/campus-audit.ts`, `src/lib/__tests__/map-resilience.test.ts`, `src/lib/__tests__/campus-audit.test.ts`, `scripts/audit-campus-data.ts`, `supabase/proposals/PROPOSITION_archived_rls.sql`, `docs/RENDER_ENV.md`, ce rapport.

## 4. Résultats exécutés (environnement de l'audit)
| Commande | Résultat |
|---|---|
| `npm run typecheck` | OK, 0 erreur |
| `npm test` | **59 tests passent** (36 initiaux + 23 ajoutés) |
| `npm run lint` | 0 erreur, 5 avertissements (préexistants) |
| `npm run build` | OK — avec variables **factices** (`VITE_MAP_PROVIDER=custom`, URL de style bidon) : prouve la compilation, pas le rendu |
| `npm run healthcheck` | **non concluant** : sans URL ni clés Supabase, aucun contrôle exécuté (code de sortie 1) ; réseau externe indisponible |
| `npm run audit:data` | démarre et exige les variables ; **non exécuté sur des données réelles** |

## 5. Risques restants
- Rendu réel du fond de carte (lisibilité, hiérarchie routes/labels) : **non évalué**. Les ID de style marqués « À VÉRIFIER » dans `map-config.ts` (MapTiler `satellite`, `dark` = `dataviz-dark` ; Esri `hybrid`, `dark`) n'ont pas été testés avec une clé. Esri « hybride » = imagerie seule.
- Je n'ai **pas changé de fournisseur ni d'ID de style** (règle du cahier des charges) : une comparaison MapTiler / Mapbox / Esri / tuiles autohébergées (licence, quotas, couverture de Kinshasa) reste à faire avec des clés réelles.
- Le fond de secours OSM utilise `tile.openstreetmap.org` : sa politique d'usage interdit une utilisation intensive ; acceptable en secours ponctuel, pas comme fond principal.
- Responsive 320/360/390/430 px, tablette, bureau : **non testé visuellement** (pas de navigateur dans l'environnement). Le code utilise déjà `dvh`, safe-areas, tableaux défilants et cibles 44 px ; à vérifier sur appareil.
- Parcours Supabase (inscription, session, favoris, réservations, signalements, rôles) : audités par lecture de code et migrations seulement.

## 6. À vérifier dans Render / chez le fournisseur
Voir `docs/RENDER_ENV.md`. Points clés : variables `VITE_*` présentes **au moment du build** ; clé de carte restreinte au domaine ; style par défaut existant pour le compte ; quota ; règle de réécriture SPA `/* → /index.html` ; domaine dans Supabase Auth → URL Configuration.

## 7. Vérifications nécessitant Supabase ou un vrai appareil
Lancer `npm run audit:data` avec les clés de l'environnement ; tester RLS avec un compte non-admin (lecture d'un bâtiment archivé avant/après la proposition SQL) ; GPS réel en extérieur ; PWA installée (hors-ligne) ; réseau lent (3G simulée).

## 8. Améliorations recommandées (version ultérieure)
Comparatif chiffré de fournisseurs sur le centre de Kinshasa ; ajustement fin des couches du style (contraste, tailles de libellés) une fois le fournisseur figé ; tests de bout en bout (Playwright) ; migration de `schedules` vers une lecture authentifiée si la Direction le souhaite ; README du projet.

## 9. Liste de contrôle en production
1. Ouvrir `/map` en navigation privée : fond chargé, aucune bannière de secours. 2. Basculer Plan → Satellite → Hybride → Sombre : chaque bouton change réellement le fond. 3. DevTools → Réseau : aucune réponse 401/403/429 sur `style.json`/tuiles. 4. Couper le réseau puis recharger : message clair, pas de carte vide muette. 5. Zoom < 17 : pastilles de bâtiments compactes ; ≥ 17 : noms visibles. 6. Itinéraire entre deux lieux du réseau : tracé conforme aux chemins ; vers un lieu non raccordé : message explicatif, pas de ligne. 7. Rafraîchir `/map` : pas de 404. 8. Largeurs 320/360/390/430 px : aucun défilement horizontal, boutons accessibles. 9. Compte non-admin : pas d'accès `/admin`. 10. Lancer `npm run audit:data` et transmettre le rapport à l'administration.
