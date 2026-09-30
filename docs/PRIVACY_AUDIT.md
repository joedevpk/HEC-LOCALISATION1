# Audit confidentialité — HEC Localisation (30 septembre 2026)

Audit du code (`src/`, `public/`, `index.html`, `supabase/`). Rien n'est affirmé au‑delà de ce que le code montre.

## Données réellement collectées
| Donnée | Où | Quand |
|---|---|---|
| E‑mail, mot de passe | Supabase Auth | Création de compte / connexion |
| Nom complet, rôle, date de création | table `profiles` | Inscription |
| Paramètres (langue, thème, taille, contraste, animations, itinéraire accessible, 7 notifications) | localStorage `hec-settings` + table `user_settings` (si connecté) | Modification des paramètres |
| Favoris (`location_id`) | table `favorites` | Ajout d'un favori |
| Texte des recherches | table `search_history` | Sélection d'un résultat, si connecté (désactivable) |
| Réservations (lieu, date, heures, motif) | table `bookings` | Formulaire de réservation |
| Signalements (catégorie, description, libellé de lieu) | table `reports` | Formulaire de signalement |
| Notifications reçues | table `notifications` | Générées côté serveur |
| Photo de profil | Non collectée : `avatar_url` provient du fournisseur OAuth (Google/GitHub) et n'est qu'affichée | — |
| **Position GPS** | **Non enregistrée** : aucune écriture en base (`grep` sur toutes les insertions) ; calcul d'itinéraire dans le navigateur | — |
| Scan de QR | Lecture seule de `qr_codes` ; aucun journal de scans | — |

## Cookies et stockage
Aucun `document.cookie` dans le code. localStorage : `sb-…-auth-token` (session Supabase), `hec-settings`, `hec-privacy-prefs`, `hec_pwa_banner_dismissed`, `hec_onboarding_seen_<userId>`. sessionStorage : `hec_oauth_pending`, `hec:chunk-reload`. Cache du service worker : fichiers de l'app, tables publiques du campus, photos publiques (les tables privées sont exclues).
Aucun outil d'analyse, de publicité ou de suivi (recherche de gtag, GA, Plausible, PostHog, Mixpanel, Sentry, Hotjar, pixels : aucun résultat) → **aucun bandeau de consentement requis**.

## Services tiers détectés
Supabase (auth, base, Storage) · MapTiler (défaut) ou Mapbox / Esri selon `VITE_MAP_PROVIDER` · tuiles OpenStreetMap (secours) · Overpass API (zone de carte visible) · Google Fonts (index.html) · Google / GitHub (OAuth, sur action de l'utilisateur).

## Écarts corrigés pendant cette mission
- Formulaires Signalements et Réservations : pas de protection double clic, erreurs avalées silencieusement → corrigés.
- Message vague « stockées de manière sécurisée » (Paramètres) → reformulé.
- Cache hors ligne : tables privées exclues (mission précédente).

## Non implémenté / à traiter
- Suppression de compte en libre‑service (nécessite une fonction serveur ; procédure administrative documentée).
- Durées de conservation : aucune purge automatique.
- Google Fonts chargé depuis Google : à auto‑héberger si l'établissement souhaite éviter ce transfert d'IP.
- Relecture juridique des textes.
