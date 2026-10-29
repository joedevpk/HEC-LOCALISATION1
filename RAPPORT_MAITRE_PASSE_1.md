# Rapport — Prompt maître HEC LOCALISATION (passe 1)

Verdict honnête : **pas encore prêt pour présentation au DG sur tous les points du prompt.** Cette passe traite le routage, le flou, le débordement mobile et la provenance des données. Le reste est listé en « Non réalisé ».

## État initial mesuré
typecheck OK · 180 tests OK · lint 0 erreur (6 avertissements) · build OK.

## Corrigé
1. **Itinéraires qui disparaissent** (`MapPage.tsx`, nouveau `src/lib/route-session.ts`)
   - Cause : tout nouveau calcul externe effaçait aussitôt le tracé valide ; un échec (quota, réseau) l'effaçait aussi ; rien ne liait un tracé à sa destination ; après le chargement du réseau interne, un tracé externe déjà calculé pouvait être effacé sans recalcul.
   - Correction : chaque tracé est étiqueté (destination + départ) et n'est affiché que pour sa destination ; même destination → le tracé reste visible pendant le recalcul (bandeau « mise à jour… ») ; échec sur la même destination → tracé conservé avec avertissement explicite de la vraie cause ; autre destination → jamais l'ancien tracé.
   - Déjà correct dans le code existant (vérifié à la lecture, non modifié) : annulation par AbortController, seuil anti-bruit GPS (40 m), classification 401/403/429/400/404, aucune ligne droite fictive, contrôle d'accrochage à 1 km.
2. **Flou** : `backdrop-blur` retiré des panneaux, barres, modales et de la classe `.glass` (surfaces quasi opaques). Conservé uniquement sur les petits boutons posés sur photos (Hero, galerie).
3. **Débordement mobile** : `min-w-0` + `overflow-x-hidden` sur le `<main>` d'AppShell ; `min-w-0` sur les grilles du dashboard.
4. **Provenance des données** : migration additive `20261026090000_data_provenance_columns.sql` (verification_status, verified_at/by, data_source, location_accuracy, photo_verified ; tout existant = `pending` ; seules les lignes de seed connues = `seed_demo`) + script d'inventaire en lecture seule `supabase/supabase/diagnostics/inventory_demo_and_unverified_data.sql`.

## Tests
6 nouveaux tests (`route-session.test.ts`). Résultat final : typecheck OK · 186/186 tests · lint 0 erreur · build OK.

## À exécuter côté Supabase
Dans l'ordre : l'inventaire (lecture seule), puis la migration `20261026090000`. Non exécutée par moi (aucun accès à votre base). Sauvegarde préalable recommandée.

## Variables d'environnement
Inchangées. **Renouveler la clé ORS partagée** (considérée compromise). Les `VITE_*` sont visibles dans le navigateur.

## Non réalisé (à traiter dans une passe suivante)
- Proxy backend sécurisé pour ORS (la clé reste côté navigateur).
- Départ « adresse cherchée » / « point sur la carte » pour l'itinéraire extérieur (non vérifié dans cette passe).
- Réseau intérieur administrable ; diagnostic de couverture et signalement des chemins manquants.
- Affichage des statuts de validation dans l'UI (la colonne existe, l'UI ne l'utilise pas encore) ; import CSV ; détection de doublons ; journal d'audit.
- Galerie de photos : l'existant (`building_images`, `location_images`) n'a pas été audité en détail ; états « Photo non disponible », ordre, validation à vérifier.
- Audit RLS/Storage et rôles : seulement lu en surface, non testé contre une vraie base.
- Tests navigateur 320→1440 px : non exécutés ; le responsive n'est corrigé que par lecture de code.
- Audit de contraste WCAG et dashboard : statistiques réelles non vérifiées une à une.
- Test réel d'ORS : impossible ici (pas de clé ni d'accès réseau).

## Données manquantes à fournir
Coordonnées GPS vérifiées de chaque bâtiment/salle/entrée, photographies réelles, plans, horaires confirmés.
