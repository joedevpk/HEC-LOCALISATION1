# HEC Localisation — Icône MapLibre "office" + reprise PWA

## 1. Cause exacte

**"office" ne vient pas de notre système d'icônes POI et ne peut donc pas en venir.**

Preuves de l'audit (point par point, comme demandé) :

1. `POICategory` (dans `src/lib/poi-categories.ts`) liste 17 catégories — `school`, `hospital`, `pharmacy`, `stadium`, `bank`, `church`, `restaurant`, `market`, `shop`, `gas_station`, `police`, `government`, `parking`, `transport`, `hotel`, `library`, `other`. **`'office'` n'existe pas** dans ce type ni dans le registre.
2. Aucune icône "office" n'est jamais créée : `loadPoiIcons()` ne boucle que sur `POI_CATEGORIES` (donc jamais sur "office"), et tous les ids qu'il génère sont préfixés `poi-icon-<catégorie>` (ex. `poi-icon-bank`) — jamais un id nu comme `"office"`.
3. `grep -rn "addImage"` sur tout `src/` : deux appels seulement, `ROUTE_ARROW_IMAGE_ID` (flèche d'itinéraire) et l'icône de catégorie POI dans `loadOneIcon()`. **Aucun `map.addImage("office", ...)` n'existe nulle part dans le projet.**
4. `loadPoiIcons()` est bien appelé avant `addPoiLayers()` (`.then()` chaîné), dans `map.on('load', ...)` ET dans `map.on('style.load', ...)` — donc pas de course asynchrone de ce côté (point 7 confirmé sans anomalie).
5. Un `setStyle()` vide bien les images précédemment ajoutées (comportement MapLibre standard) — mais ce n'est pas la cause ici, `loadPoiIcons()` est déjà rappelé après chaque `style.load` (point 5 et 6 déjà correctement gérés dans le code existant).
6. `icon-image` n'est utilisé qu'à deux endroits dans tout le projet (`CampusMap.tsx` lignes 284 et 380) : la flèche de route, et `['get', 'icon']` pour les POI externes OSM — dont la valeur passe systématiquement par `poiIconId(poi.category)`, donc toujours un id `poi-icon-*` correctement enregistré.
7. Les marqueurs HEC internes (bâtiments, bureaux, salles, entrées) — c'est là que vit réellement la notion `kind === 'office'` (dans `src/lib/types.ts`, un type de local, sans rapport avec `POICategory`) — sont rendus en **marqueurs DOM** (`new maplibregl.Marker({ element: ... })`, SVG inline), **jamais** via un layer `symbol`/`icon-image` MapLibre. "office" (kind de local) ne touche donc jamais le système d'images de MapLibre.
8. **Aucun écouteur `styleimagemissing` n'existait avant cette correction** (`grep` : zéro résultat) — c'est la vraie faille.

**Conclusion : "office" est demandé par un layer `symbol` intégré au *style de base* du fournisseur cartographique** (MapTiler/Mapbox/Esri, résolu par `getMapStyle()` dans `src/lib/map-config.ts`) — un nom de sprite standard type Maki/Mapbox Streets pour les points d'intérêt "bureaux", totalement hors de notre système de catégories. Quand ce sprite fournisseur ne fournit pas (ou ne charge pas) cette icône précise, MapLibre déclenche l'événement `styleimagemissing` ; comme rien ne l'écoutait, MapLibre se contentait d'un warning répété en console — c'est exactement le message reçu.

## 2. Fichier responsable

- **Fichier en cause (absence)** : aucun fichier ne "contient" le bug — c'est une fonctionnalité manquante : `src/lib/poi-icon-sprites.ts` (notre unique point d'intégration MapLibre pour les images) n'avait jamais de filet `styleimagemissing`.
- **Fichiers modifiés pour la correction** :
  - `src/lib/poi-icon-sprites.ts` — ajout de `attachMissingIconFallback(map)`.
  - `src/components/CampusMap.tsx` — un seul appel, une seule fois par instance de carte.

## 3. Correction effectuée

Ajout d'un écouteur global `map.on('styleimagemissing', ...)` (nouvelle fonction exportée `attachMissingIconFallback`) qui, pour **tout** id d'image manquant — le nôtre ou celui d'un layer du fournisseur — enregistre une image de repli minimale **1×1 transparente** via `map.addImage()`, avec `hasImage()` en garde d'idempotence et un `try/catch` qui ne casse jamais la carte (même filet de sécurité que `loadOneIcon` existant).

Attaché **une seule fois** par instance de `map`, juste après sa création (comme les autres écouteurs globaux `map.on('error', ...)`) — pas besoin de le rattacher après un `setStyle()`, car `styleimagemissing` est un événement de la `map`, pas du style : il n'est jamais supprimé par un changement de style (contrairement aux images elles-mêmes, déjà bien gérées par le rappel existant de `loadPoiIcons()` dans `style.load`).

Aucune modification du système de catégories, d'aucun layer existant, de Supabase, de la géolocalisation ni du routing. Les 17 catégories, leurs couleurs/pictogrammes et le layer `poi-unclustered` restent strictement identiques.

## 4. Pourquoi "office" était introuvable

Parce qu'il ne nous appartient pas : c'est un nom de sprite du style de carte fourni par le prestataire (MapTiler/Mapbox/Esri selon `VITE_MAP_PROVIDER`), utilisé par un layer que **nous n'avons pas écrit** et que MapLibre charge automatiquement avec le style de base. Notre système de catégories (`POICategory`) n'a jamais eu vocation à couvrir ce nom, et n'aurait de toute façon pas pu le fournir : nos ids d'icônes sont toujours préfixés `poi-icon-`. Le vrai manque n'était donc pas "une icône office non créée" mais l'absence d'un filet de sécurité générique pour tout layer hors de notre contrôle qui référence un sprite absent — désormais en place.

*Remarque annexe (signalée, non modifiée) :* si le sprite du fournisseur échoue à charger plus largement (pas seulement "office"), le même filet couvrira automatiquement toute autre icône manquante du même style — mais si vous voyez disparaître beaucoup d'icônes de la carte de base (pas seulement les POI HEC), cela vaut la peine de vérifier la clé API / le plan tarifaire du fournisseur configuré, hors du périmètre code.

## 5. Résultat `npm run typecheck`

Comme lors du correctif précédent, `tsconfig.app.json` livré dans le projet pointe toujours vers `dev/src` au lieu de `src` (anomalie préexistante, non liée à ce correctif ni au précédent — toujours pas corrigée, car explicitement hors du périmètre demandé pour ces deux tâches). Vérifié malgré tout avec une configuration `tsc` temporaire pointant correctement vers `src/` (non livrée) :

**Aucune erreur dans les fichiers modifiés ou créés** (`poi-icon-sprites.ts`, `CampusMap.tsx`, `pwa-install.ts`, `main.tsx`, `SettingsPage.tsx`). Seule anomalie préexistante et sans rapport : absence de types pour le paquet `qrcode` dans `src/lib/qr-utils.ts` (déjà présente avant toute correction).

## 6. Résultat `npm run build`

✅ Succès :
```
✓ 1750 modules transformed.
dist/index.html                     1.83 kB
dist/assets/index-*.css           118.23 kB
dist/assets/index-*.js          1,589.33 kB
✓ built in 12.73s
PWA v1.3.0 — mode generateSW — precache 17 entries (1683.85 KiB)
files generated: dist/sw.js, dist/workbox-*.js
```
Aucune erreur, aucun `as any` utilisé (le type `BeforeInstallPromptEvent`, absent des types DOM standards de TypeScript, a été déclaré explicitement dans `src/lib/pwa-install.ts` plutôt que masqué).

---

# PWA — reprise du problème 1

## Ce qui a déjà été vérifié et reste vrai (audit précédent)

Le manifest, les icônes (192/512 any + maskable), le Service Worker généré (`dist/sw.js`, precache Workbox), et le script d'enregistrement injecté dans `dist/index.html` sont tous **corrects et présents** dans le build de production réel. Aucune régression de ce côté.

## Ce qui a été trouvé et corrigé cette fois

Recherche explicite de `beforeinstallprompt` dans tout `src/` : **aucun résultat, à aucun moment**. Conséquence concrète : cette application dépend **entièrement** du déclenchement automatique de Chrome/Edge sur Android (la "mini-infobar"), qui n'apparaît qu'après une heuristique d'engagement propre au navigateur (visites répétées, temps cumulé passé sur le site) — heuristique non documentée précisément par Google et qui peut prendre plusieurs sessions avant de se déclencher. C'est la cause la plus probable de "l'installation n'apparaît pas comme attendu" : l'app est installable, mais rien ne le propose tant que Chrome n'a pas lui-même décidé de le faire.

**Correction apportée** (bonne pratique standard recommandée par Chrome/web.dev) :
- Nouveau fichier `src/lib/pwa-install.ts` : capture l'événement `beforeinstallprompt` dès qu'il est disponible (`event.preventDefault()` pour reprendre la main sur le moment de l'afficher), l'expose de façon fiable (`isPwaInstallAvailable`, abonnement React `subscribePwaInstall`), et permet de le déclencher explicitement (`promptPwaInstall()`).
- `src/main.tsx` : démarre cette écoute le plus tôt possible (`initPwaInstallListener()`, juste après `bootstrapDeepLinks()`), avant même le premier rendu React.
- `src/pages/SettingsPage.tsx`, section "À propos" (déjà existante) : un bouton **"Installer l'application"** apparaît **uniquement** quand le navigateur a réellement proposé l'installation (`pwaInstallAvailable`) — jamais affiché sur iOS Safari, sur desktop sans support, ou si l'app est déjà installée : aucun état inventé.
- **Mise à jour** : le même déclencheur est désormais aussi visible sur l'**accueil** (`DashboardPage.tsx`, onglet "Accueil", tout en haut) et sur la **page de bienvenue** (`LandingPage.tsx`, juste sous les boutons "Explorer la carte" / "Me guider"), via un nouveau composant partagé `src/components/PwaInstallBanner.tsx` — une bannière fermable (bouton ✕, mémorisé comme l'onboarding déjà existant dans `AppShell.tsx`) plutôt qu'un bouton isolé, pour rester visible sans être intrusif. Le hook `usePwaInstallAvailable` a été déplacé dans `src/lib/pwa-install.ts` pour être partagé entre les trois emplacements (Réglages, Accueil, Bienvenue) sans dupliquer la logique.

Cela ne remplace ni ne modifie le manifest/Service Worker existants — cela donne simplement à l'utilisateur un moyen fiable de déclencher l'installation dès qu'elle est réellement possible, au lieu de dépendre uniquement du timing (parfois long, parfois absent en test rapide) choisi par Chrome.

## PWA et iPhone : oui, mais différemment d'Android

Le manifest, le Service Worker et les icônes sont déjà corrects pour iOS (`apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title` — tous déjà présents dans `index.html`, iOS ignorant de toute façon `manifest.json` pour ses icônes). Mais **Safari (et tout navigateur sur iOS, y compris Chrome iOS — tous basés sur WebKit imposé par Apple) ne supporte jamais `beforeinstallprompt`** : c'est une limitation permanente d'Apple, pas un bug corrigible côté code. Conséquence concrète : le bouton "Installer l'application" ajouté plus haut **ne s'affichera jamais sur iPhone/iPad**, quoi qu'on fasse — c'est le comportement attendu, pas une régression.

Sur iOS, l'installation est **100 % manuelle**, et il n'existe aucune API pour la déclencher ni même savoir si elle est possible à l'avance. La seule chose qu'on peut faire est informer l'utilisateur de la marche à suivre.

**Ajouté** : `src/lib/pwa-install.ts` expose désormais aussi `isIos()` (détection iPhone/iPad, y compris les iPad récents qui s'annoncent comme "Macintosh") et `isRunningStandalone()` (l'app tourne déjà en mode installé — via `navigator.standalone` sur iOS ou `display-mode: standalone` ailleurs). Dans `SettingsPage.tsx` → "À propos", si l'appareil est iOS et que l'app n'est pas déjà installée, un texte s'affiche : *"Sur iPhone/iPad : appuyez sur Partager (icône carrée avec une flèche vers le haut) dans Safari, puis sur « Sur l'écran d'accueil »."* Jamais affiché en même temps que le bouton Android (mutuellement exclusifs par construction), jamais affiché si l'app est déjà installée.

## Ce qui reste à vérifier en direct (toujours hors de portée sans accès au site déployé)

1. Sur le téléphone Android concerné, ouvrir `chrome://inspect` (USB debugging) ou le site en production, puis DevTools > Application > Manifest : confirmer qu'aucune erreur n'apparaît et que "Installability" ne signale rien.
2. Naviguer/rester sur le site quelques minutes puis vérifier si le bouton "Installer l'application" apparaît dans Réglages > À propos (il doit apparaître dès que Chrome émet `beforeinstallprompt`, généralement bien avant que la mini-infobar automatique ne se déclenche).
3. `curl -I https://votre-domaine/manifest.json` et `.../sw.js` pour confirmer les en-têtes réels servis par Render.
4. Si le bouton n'apparaît jamais même après plusieurs minutes de navigation : c'est le signe le plus clair d'un vrai problème serveur (HTTPS, en-têtes, ou sprite/API key du fournisseur cartographique dans un tout autre registre) plutôt que d'un souci de code applicatif — à ce stade, les logs de la console DevTools sur le vrai appareil deviennent nécessaires pour aller plus loin.

## Point annexe détecté pendant cet audit (signalé, non corrigé — hors périmètre)

`public/_redirects` (format Netlify `/* /index.html 200`) : la documentation officielle de Render indique que les redirections/réécritures pour les sites statiques se configurent **depuis le Dashboard Render**, pas via un fichier `_redirects` dans le dépôt. Ce fichier est probablement ignoré en production sur Render. Cela n'affecte pas le manifest/Service Worker (ce sont de vrais fichiers, toujours servis tels quels, redirections ou non), mais cela pourrait expliquer un 404 si quelqu'un scanne un QR code pointant vers `/qr/:code` et arrive directement sur le serveur sans navigation JS préalable. Si c'est un comportement observé, il faudra ajouter une règle de réécriture (`/qr/*` → `/index.html`, action *Rewrite*) directement dans le Dashboard Render — pas dans le code.
