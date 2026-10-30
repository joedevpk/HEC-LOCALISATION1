# Actions qui nécessitent votre intervention

Rien de ceci n'a pu être fait depuis mon environnement (aucun accès à Supabase, Render, OpenRouteService, ni à un appareil).

## Immédiat (préproduction)
1. **Récupérer le code** dans votre dépôt Git (branche dédiée, sans écraser de fichier) — `05_PROCEDURE_PREPRODUCTION.md` §2.
2. **Créer ou désigner** un projet Supabase et un service Render de **préproduction**, séparés de la production.
3. **Sauvegarder** la base et les photos, puis **tester la restauration** une fois.
4. **Vérifier qu'un compte `SUPER_ADMIN` existe** avant d'appliquer la migration de cette passe.
5. **Appliquer la migration** `20261028090000_role_hierarchy_guard.sql` en préproduction (méthode selon votre historique — §4 de la procédure).
6. **Générer une nouvelle clé OpenRouteService**, la placer en secret Supabase, déployer `route-walking`, passer Render en `VITE_ROUTING_PROVIDER=proxy`, supprimer `VITE_ROUTING_API_KEY`, redéployer, puis **révoquer l'ancienne clé**.
7. **Exécuter les tests de fumée** (§8) et la **checklist téléphone** sur un iPhone et un Android.
8. **Exécuter les trois diagnostics SQL** en lecture seule et me communiquer les résultats si vous le souhaitez.

## Décisions de votre part
- Les **photos doivent-elles être confidentielles** ? Si oui : bucket privé et URL signées (non implémenté).
- Un **gestionnaire** doit-il pouvoir importer des données (création « en attente ») ? Actuellement oui.
- Que faire du **bâtiment de démonstration** déjà présent en production, s'il y est (archiver ou supprimer) ?
- Isoler l'écriture du **journal d'audit** (risque N-01) : à planifier ?

## Données institutionnelles (HEC Kinshasa) — à fournir, rien n'est inventé
- Noms officiels des bâtiments et des salles, avec leurs codes.
- **Coordonnées GPS mesurées sur le terrain** (WGS84) : entrée de chaque bâtiment et de chaque salle importée.
- **Photographies autorisées** (droit de diffusion confirmé).
- Plans, informations d'orientation, horaires confirmés, services réellement présents.
- Remplir le modèle `docs/modeles/modele_donnees_institutionnelles.csv` (mode d'emploi : `docs/MODELE_CSV_INSTITUTIONNEL.md`), supprimer les lignes `EXEMPLE FICTIF`, importer en préproduction, puis **faire valider** chaque position par un administrateur après contrôle sur la carte.
- Remplacer le centre du campus par défaut (15.3, −4.32 : approximation) par la position mesurée.

## Pour la présentation au Directeur général
- Itinéraires réels vérifiés sur le terrain (au moins 3 trajets) avec la vraie clé ORS.
- Données validées (pas seulement « en attente ») pour les lieux montrés.
- Test sur appareil réel, y compris mode sombre et lecteur d'écran si l'accessibilité est un critère.
