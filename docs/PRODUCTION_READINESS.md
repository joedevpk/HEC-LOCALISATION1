# État de préparation production — HEC Localisation

Légende : **✓** vérifié dans le code ou par une commande exécutée · **⚠** documenté, nécessite une configuration ou un test externe · **✕** non implémenté.
« Vérifié » = lecture du code + commandes `typecheck`, `test`, `lint`, `build` exécutées. **Aucun test n'a été fait sur un vrai navigateur, un vrai téléphone ni un vrai projet Supabase.**

## Les 20 règles

| N° | Règle | État | Constat / action |
|---|---|---|---|
| 01 | Limiter les requêtes par visiteur | ⚠ | Chargement initial groupé via `CampusContext` (données campus chargées une fois), listes limitées (événements 200, annonces 50, notifications 50, réservations/signalements 100). Pas de rate limiting serveur : à activer côté Supabase (*Auth → Rate Limits*) ; non configurable depuis React. |
| 02 | Plafonner les appels API | ✓ | Timeout global 15 s (60 s uploads) sur toutes les requêtes Supabase (`src/lib/supabase.ts`) ; Overpass avec timeout, `AbortController`, retries contrôlés (`osm-poi.ts`) ; annulation des requêtes POI obsolètes (`MapPage`). |
| 03 | Plafonner les dépenses fournisseurs | ⚠ | Non plafonnable depuis l'application. À configurer : MapTiler (limite de requêtes/plan, restriction de la clé par domaine), Supabase (*Spend Cap* activé, alertes d'usage egress/stockage), hébergeur (bande passante). Overpass est gratuit mais soumis à quotas. |
| 04 | Message quand ça plante | ✓ | `ErrorBoundary` global, `ErrorState` avec « Réessayer », aucune stack trace affichée. |
| 05 | Loading au lieu d'écran blanc | ✓ | `Spinner`, `Skeleton`, `SkeletonList`, pages chargées en lazy avec repli. Non testé visuellement page par page. |
| 06 | Empty states | ✓ | Composant `EmptyState` utilisé (événements, favoris, notifications, contacts…). |
| 07 | Requêtes qui échouent | ✓ | Erreurs critiques remontées ; erreurs secondaires (événements, annonces, réseau) n'interrompent pas l'application (`CampusContext`). |
| 08 | API qui ne répondent pas | ✓ | Timeouts ci-dessus → message « Le serveur ne répond pas », jamais de chargement infini. |
| 09 | Double clic sur Envoyer | ✓ | Gardes `useRef` + `loading` sur Connexion/Inscription, Réservations, Signalements ; `saving`/`busy` sur les formulaires admin. Vérifié par lecture du code. |
| 10 | Double paiement | ✓ | **Non applicable — aucun paiement n'est implémenté** (une page `BillingPage` existe ; aucune passerelle de paiement n'est branchée). |
| 11 | Charger uniquement les données affichées | ⚠ | Listes utilisateur limitées. Les données campus (`buildings`, `locations`, réseau) utilisent `select('*')` et la jointure `building:buildings(*)` : acceptable pour un seul campus, à revoir si le volume dépasse quelques centaines de lieux. |
| 12 | Index SQL | ✓ | 6 index composites dans `20260930090000_storage_limits_and_indexes.sql` (événements, annonces, notifications, historique, réservations, signalements). Aucun index supprimé. À appliquer sur la base réelle : ⚠. |
| 13 | Pagination | ⚠ | Limites fixes (pas de pagination par pages) ; suffisant au volume actuel. Liste admin des QR et des utilisateurs non paginées. |
| 14 | Compression des fichiers | ✓ | Compression côté client (1920 px max, WebP) avant envoi (`image-compress.ts`). |
| 15 | Limiter le poids des fichiers | ⚠ | Limite 5 Mo + MIME imposés côté serveur par la migration `20260930090000` (**à appliquer sur Supabase**) ; client : contrôle type/poids et message clair ; indication « Taille maximale : 5 Mo » ajoutée dans les panneaux photos. |
| 16 | Mémoriser ce qui ne change pas | ✓ | Service worker : `NetworkFirst` sur tables publiques uniquement (liste blanche), `CacheFirst` sur photos Storage et, **ajouté**, sur `/images/hec/`. Aucune donnée privée en cache. |
| 17 | Alerte si le site tombe | ⚠ | `npm run healthcheck` fourni (application, manifeste, API Supabase). **Aucune alerte n'est active** : à brancher sur UptimeRobot / Better Stack / Render / GitHub Actions (voir `MONITORING.md`). |
| 18 | Trace de chaque erreur | ✓ | `logger.ts` : `window.error`, `unhandledrejection`, ErrorBoundary ; filtrage des secrets, déduplication, plafond de 30 envois/session. Endpoint de collecte optionnel (`VITE_LOG_ENDPOINT`), non configuré par défaut. |
| 19 | Test multi-visiteurs | ⚠ | **Non exécuté.** Scénarios 10/50/100 utilisateurs et script k6 dans `LOAD_TEST.md`. Aucun résultat (p95, taux d'erreur) n'existe. |
| 20 | Test de restauration | ⚠ | **Test de restauration non exécuté.** Procédure dans `BACKUP_RESTORE.md`. |

## Sécurité — constats

- **Secrets** : aucune clé `service_role` ni clé en dur dans `src/`, `public/` ou l'historique du ZIP ; `.env` exclu par `.gitignore`, `.env.example` ne contient aucune vraie valeur. ✓
- **RLS** : activée sur les 19 tables du schéma. Lecture publique limitée au contenu du campus ; données personnelles (profil, favoris, réservations, notifications, signalements, paramètres, historique) en « own only » ; écriture bâtiments/lieux/réseau/QR/photos réservée aux rôles admin via `is_campus_admin()`. ✓ (lecture des migrations — **non testée sur une base réelle**)
- **Escalade de rôle** : déclencheurs `trg_prevent_role_self_escalation` et `trg_restrict_self_signup_role` bloquent l'auto-promotion. ✓ (lecture du code SQL, non testé en base)
- **Storage** : lecture publique des buckets d'images, écriture/suppression réservées aux admins. ✓ (lecture du code SQL)
- **Points d'attention** : les tables `campus_events` et `announcements` n'ont pas de policy d'écriture admin (la création passe par le tableau Supabase) ; les QR codes sont lisibles publiquement (par conception : ils servent au scan).
- **Clé anon** : publique par conception ; sa sécurité repose sur les RLS ci-dessus.

## Photos institutionnelles

- Les 7 photos sont dans `public/images/hec/` (810×1080 px, sauf une en 720×540). Usage dans le Hero (rotation de 3 s), décrites sans inventer leur contenu (`src/lib/hec-images.ts`).
- **Résolution** : sur un grand écran de bureau, des images portrait de 810 px de large sont agrandies et peuvent paraître moins nettes. Fournir les originaux haute résolution à la HEC pour un rendu optimal.
- **Droits** : deux photos de nuit (`hec-night-01`, `hec-night-02`) portent une signature de photographe incrustée. Obtenir l'autorisation d'usage/crédit avant diffusion publique.

## À faire avant la présentation

1. Appliquer les migrations sur le projet Supabase (après sauvegarde) et vérifier les limites de bucket.
2. Restaurer une sauvegarde dans un projet de test et consigner le résultat.
3. Exécuter le test de charge sur un environnement de test et consigner les résultats.
4. Configurer une surveillance externe et les plafonds MapTiler/Supabase.
5. Renseigner les coordonnées officielles (`VITE_CONTACT_EMAIL`) : la page À propos affiche « Contacts à venir » tant qu'elles sont absentes.
6. Tester sur de vrais iPhone, Android, iPad et navigateurs de bureau (non fait ici).
