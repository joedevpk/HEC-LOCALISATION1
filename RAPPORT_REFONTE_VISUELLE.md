# Rapport — Refonte visuelle HEC Localisation (logo officiel + direction artistique)

Complète `RAPPORT_AUDIT_HEC_LOCALISATION.md` (carte, secours, données). Aucun commit, aucun
déploiement, aucune migration, aucune modification de Supabase/RLS.

**Limite essentielle :** aucun navigateur n'était disponible dans l'environnement de travail. Les
changements ont été validés par compilation, lint, tests unitaires et build, **jamais par un rendu
visuel**. Le rendu réel (logo, sidebar, pied de page, 320–1440 px, mode sombre) reste à contrôler à l'œil.

## 1. Audit — ce qui a été constaté
- La marque était rendue par **un seul composant** `Logo` (`src/components/ui.tsx`) : un carré bleu foncé avec une icône
  d'épingle (lucide `MapPin`), utilisé dans 5 endroits (barre publique, sidebar, accueil/pied de page, connexion, scan QR).
  Un seul remplacement suffisait donc pour toute l'application.
- Favicon, icônes PWA et `apple-touch-icon` reprenaient aussi l'ancienne épingle.
- Les pages (accueil, connexion, carte, recherche, bâtiments, tableaux de bord, admin) existaient déjà, alimentées par
  Supabase : elles ont été **restylées, pas reconstruites**. La maquette n'a pas été copiée comme image.

## 2. Logo officiel
- Fichier fourni copié tel quel : `public/images/hec-logo.png` (PNG 199×254, fond blanc opaque). Non redessiné, non recoloré.
- `Logo` réécrit : `<img>` avec `object-contain`, hauteur seule imposée (ratio d'origine conservé), `width/height` natifs,
  alt « Logo officiel de la Haute École de Commerce de Kinshasa ».
  Variantes : tailles `sm | md | lg | xl`, `inverted` (fond bleu foncé), `markOnly`, `tagline`
  (« Haute École de Commerce de Kinshasa »), `stacked` (écran de connexion).
- Le logo a un fond blanc : il est toujours posé dans un petit conteneur blanc neutre → lisible sur fond clair comme sur bleu foncé.
- **Emplacements :** barre de navigation publique (+ menu mobile), sidebar de l'application, pied de page de l'accueil,
  écran de connexion/inscription, page de scan QR, **feuille imprimée des QR codes** (`QRPage`), favicon,
  icônes PWA (192/512, maskable), icône iOS.
- Les icônes PWA/favicon sont **dérivées du logo** (centré sur fond blanc, marge de sécurité pour « maskable »). Le fichier source étant
  petit (199×254), les icônes 512 px sont **agrandies et donc un peu floues** : fournir une version haute définition ou vectorielle (SVG/PDF)
  du logo pour les remplacer.

## 3. Système de design
- Couleurs mesurées sur le logo : jaune dominant `#faf120`, bleu dominant `#067fd4`, rouge `#d90f16`.
  Ajoutées à Tailwind : `gold-300/400/500` (accent) et `logo-blue/yellow/red` (références exactes).
  Le bleu institutionnel existant (`hec-*`, bleu foncé `#111d47` / bleu vif `#1e5eff`) est conservé : le bleu du logo (cyan-azur) est plus clair
  et n'a pas été imposé comme couleur d'interface pour préserver le contraste du texte.
- Nouvelle variante de bouton `accent` (jaune du logo, texte bleu foncé) pour l'action phare sur fond bleu foncé.
- Contrastes calculés : jaune/bleu foncé 13,7:1 ; blanc 65 % sur bleu foncé 7,5:1 (tous ≥ 4,5:1).

## 4. Pages et composants modernisés
| Zone | Changement |
|---|---|
| Sidebar (`AppShell`) | Fond bleu foncé, entrée active en jaune, logo + « Haute École de Commerce de Kinshasa », avatar jaune ; barre mobile : indicateur actif jaune |
| Barre publique | Logo officiel ; bouton « Me guider » en jaune sur la photo |
| Accueil | Titre avec « à portée de carte. » en jaune, CTA principaux en jaune, **pied de page bleu foncé** (logo, nom complet de l'établissement, liens réels, mentions légales) |
| Connexion / inscription | Logo en grand, centré, avec le nom de l'établissement |
| Tableau de bord | Avatar et CTA aux couleurs institutionnelles |
| Administration | Cartes de statistiques avec pastille d'icône (valeurs réelles Supabase, inchangées) |
| Profil | Avatar jaune |
| QR imprimés | Logo officiel en en-tête |
| Carte | Voir le rapport d'audit (secours, bannière honnête, zoom, étiquettes) |

Écarts volontaires avec la maquette : aucun chiffre ou graphique inventé (« 18 bâtiments », « Fréquentation du campus », horaires…) n'a été
ajouté ; seules les données déjà lues dans Supabase s'affichent. Les panneaux de carte, la recherche et les fiches de bâtiments
**conservent leur structure existante** (déjà proches de la maquette : filtres, sélecteur de fond, panneaux) ; ils n'ont pas été refondus pixel par pixel.

## 5. Résultats exécutés
| Commande | Résultat |
|---|---|
| `npm run typecheck` | OK |
| `npm test` | **63 tests passent** (dont 4 nouveaux sur le logo/icônes) |
| `npm run lint` | 0 erreur, 5 avertissements préexistants |
| `npm run build` | OK avec variables factices (précache PWA : 2,15 Mo, contre 1,80 Mo avant, à cause des icônes) |

## 6. Non vérifié / à faire
- **Rendu visuel** à 320, 375, 390, 430, 768, 1024, 1440 px et en mode sombre : à contrôler sur appareil/navigateur.
- Lisibilité du logo (fond blanc) sur la photo du hero et dans la sidebar bleu foncé.
- Navigation clavier, lecteurs d'écran, `prefers-reduced-motion` : le code existant les gère en partie ; non testé en conditions réelles.
- Parcours Supabase (connexion, rôles, réservations) : non exécutés, aucun accès.
- Logo haute définition à fournir (icônes PWA, impression).
- Le pied de page des pages internes n'existe pas (l'application utilise la sidebar) : seul l'accueil public a un pied de page.
