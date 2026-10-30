# Passe 4 — Rapport d'audit général

**Périmètre** : projet fourni dans `HEC-LOCALISATION-passe3.zip` (aucun dépôt `.git` dans l'archive : l'état Git n'a pas pu être inspecté ; une copie de référence a été conservée avant toute modification).
**Environnement de test** : PostgreSQL 16 local (avec une simulation minimale de Supabase), Chromium 153 headless, faux serveur Supabase de test (fixtures fictives, `scripts/browser-check/mock-supabase.mjs`).
**Non testé** : Supabase réel, OpenRouteService réel, Render, fournisseur de cartes réel, appareil mobile réel, Deno (fonction Edge), lecteurs d'écran.

## 1. Statut des fonctionnalités
Légende : **T-nav** = testé dans un navigateur réel avec données fictives ; **T-sql** = testé sur PostgreSQL local ; **T-unit** = tests unitaires ; **Non testé réel** = dépend d'un service externe non accessible ici.

| Fonctionnalité | Statut | Preuve / limite |
|---|---|---|
| Chargement de la carte, marqueurs, fiche de lieu | Fonctionnel, testé hors service réel | T-nav : rendu sur 8 largeurs, fond de carte **local** de test. Fournisseur de tuiles réel : non testé. |
| Recherche de bâtiments / salles | Présente, rendu testé | T-nav (page rendue, aucune erreur JS) ; logique couverte par T-unit existants ; résultats sur données réelles non testés. |
| Itinéraires piétons (états, relance, annulation) | Fonctionnel, testé avec proxy **simulé** | T-nav : 13 scénarios. Intégration OpenRouteService réelle : **non testée**. |
| Fonction Edge `route-walking` | Logique testée, exécution réelle non testée | T-unit : 38 tests de logique (validation, CORS, classification, limiteur, corps borné). Non exécutée sous Deno ni sur Supabase. |
| Fiches détaillées des lieux | Fonctionnel (rendu) | T-nav ; état « Photo non disponible » vérifié. |
| Authentification | Pages rendues ; flux réel non testé | T-nav des pages connexion/inscription ; la session est **simulée**. |
| Profil, tableau de bord, paramètres, favoris, notifications, planning, réservations, signalements, assistant, visite guidée, événements | Pages rendues sans erreur | T-nav 8 largeurs × 1 page ; actions (enregistrer, réserver…) **non testées**. |
| Administration → Données (inventaire, import CSV, journal) | Fonctionnel, testé | T-nav (4 largeurs) + T-sql ; écritures réelles non testées sur Supabase. |
| Import CSV | Fonctionnel, testé | T-unit (30 tests + modèle), T-nav (refus sans écriture, import valide = 1 appel atomique), T-sql (atomicité, doublons). |
| Photographies | Partiellement testé | T-unit (extension, suppression vérifiée) ; règles de stockage en T-sql. **Envoi réel (navigateur + Storage) non testé.** |
| QR codes | Page de scan rendue ; scan caméra et gestion admin non testés | |
| Préférences d'affichage, **mode sombre** | **Non testé** | Aucun test en mode sombre n'a été réalisé dans cette passe. |
| Navigation mobile | Partiellement testé | Barre de navigation visible sur captures 320–430 px ; ouverture des menus non scénarisée. |
| Pages légales | Fonctionnel (rendu) | T-nav. |
| Migrations SQL, RLS, triggers, RPC, audit | Testé en local | T-sql : 77 contrôles + 5 scénarios (23 contrôles). Stubs ≠ Supabase réel : à rejouer en préproduction. |

## 2. Défauts constatés (priorisés)
Voir `04_PROBLEMES_CORRIGES_ET_NON_RESOLUS.md` pour le détail (identifiant, gravité, preuve, état).
Critique : escalade ADMIN → SUPER_ADMIN (corrigée). Élevé : migration de démonstration qui bloque une base neuve / injecte des données fictives (corrigée) ; blocage de géolocalisation sur lien profond (corrigé). Moyen : erreurs d'itinéraire sans relance ni catégorie (corrigé) ; photos : extension et suppression (corrigé) ; CLI Supabase et structure des dossiers (documenté). Faible : CSV hexadécimal, flous décoratifs, cibles tactiles (corrigés).

## 3. Responsive (Chromium réel)
25 pages × 8 largeurs (320, 360, 390, 430, 768, 1024, 1280, 1440 px) = **200 mesures : 0 débordement horizontal, 0 erreur JavaScript non gérée**. Onglet Données : 4 largeurs (320, 390, 768, 1280), 3 sous-onglets.
Mesures indicatives seulement : cibles tactiles < 24 px (3 liens en ligne restent sur la page de confidentialité), éléments sans nom accessible (le bouton natif de géolocalisation de MapLibre est apparu sans libellé une fois, probablement avant la fin de son initialisation — à vérifier sur appareil).
**Non effectué** : navigation au clavier, contrastes mesurés, lecteur d'écran, mode sombre. **Aucune conformité WCAG n'est revendiquée.**
Captures : générées par `scripts/browser-check/audit-app.mjs` (non incluses dans l'archive).
