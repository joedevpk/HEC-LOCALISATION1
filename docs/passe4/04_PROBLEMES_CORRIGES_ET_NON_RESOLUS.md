# Passe 4 — Problèmes corrigés et non résolus

## Corrigés
| ID | Gravité | Problème | Preuve | Correction |
|---|---|---|---|---|
| C-01 | Critique | Un `ADMIN` pouvait s'attribuer ou attribuer `SUPER_ADMIN` (appel direct à l'API) | Démontré sur PostgreSQL avant correctif | Migration `20261028090000_role_hierarchy_guard.sql` + 17 tests SQL + retour arrière testé |
| C-02 | Élevé | Migration de démo : exception sans campus (bloque `db push`) ; bâtiment fictif injecté avec campus | Reproduit | Inactive par défaut, activation explicite ; 5 scénarios testés |
| C-03 | Élevé | Lien profond `?nav=` : blocage définitif sur « Recherche de votre position… » (le contrôle natif MapLibre n'est pas prêt, `trigger()` renvoie `false` ignoré) | Reproduit en navigateur ; code de MapLibre lu | Repli sur le suivi de position ; 3 tests |
| C-04 | Moyen | Erreur d'itinéraire : pas de « Réessayer », sélecteur de départ masqué, catégories non distinguées, « service indisponible » confondu avec « réseau » | Lu dans le code, vérifié en navigateur | Types d'échec, carte d'erreur, relance ; 13 scénarios navigateur |
| C-05 | Moyen | Photo : extension déduite du nom (`photo`, `.jfif`) refusée par la règle Storage | Lu dans le code ; test unitaire | Extension déduite du type MIME |
| C-06 | Moyen | Suppression de photo : fichier retiré même si la ligne n'a pas été supprimée (RLS silencieuse) ; échec de retrait silencieux | Lu dans le code ; tests unitaires | Vérification du nombre de lignes ; orphelin signalé |
| C-07 | Moyen | Fonction Edge : identifiant IP falsifiable ; corps non borné | Lu dans le code | `cf-connecting-ip` prioritaire ; corps limité à 2 Ko ; 8 tests |
| C-08 | Faible | CSV : `0x10`, `1e1`, `0b11` acceptés comme nombres | Reproduit | Notation décimale simple uniquement ; 11 tests |
| C-09 | Faible | Flous décoratifs (`backdrop-blur`) sur l'accueil et les fiches ; liens de pied de page de 20 px de haut | Mesuré en navigateur | Fonds semi-opaques ; zones tactiles 32–44 px |
| C-10 | Moyen | CLI Supabase : migrations introuvables depuis la racine du projet | Testé avec la CLI 2.122.0 | Documenté (`--workdir supabase`), rien déplacé |
| C-11 | Faible | Aucun modèle CSV documenté ni diagnostic de photos orphelines | — | Modèle fictif non importable + doc ; diagnostic SQL lecture seule |

## Non résolus / à décider
| ID | Gravité | Sujet | Suite proposée |
|---|---|---|---|
| N-01 | Moyen | `audit_write` appelable par tout gestionnaire/administrateur (fausses lignes de journal, acteur toujours réel) | Isoler l'écriture d'audit (SECURITY DEFINER) |
| N-02 | Moyen | Buckets de photos publics en lecture ; photo archivée accessible par URL exacte | Bucket privé + URL signées si les photos doivent être protégées |
| N-03 | Faible | Limiteur de débit par instance (mémoire) | Surveiller le quota ORS ; limiteur partagé si besoin |
| N-04 | Faible | Fichiers orphelins après envoi interrompu : signalés, nettoyage manuel | Exécuter `orphan_storage_objects.sql` périodiquement |
| N-05 | À vérifier | Bouton natif de géolocalisation apparu une fois sans libellé accessible | Vérifier sur appareil réel |
| N-06 | À vérifier | Mode sombre, clavier, contrastes, lecteur d'écran non testés | Session de test dédiée |
| N-07 | À vérifier | Envoi réel de photos, scan QR, flux d'authentification réel | Tests en préproduction |
| N-08 | À vérifier | Fonction Edge non exécutée sous Deno ni sur Supabase | Déploiement en préproduction + tests de fumée |
| N-09 | Info | Pendant « Recherche de votre position… », aucun départ alternatif n'est proposé avant la fin du délai de géolocalisation (20 s) | Proposer le choix manuel dès l'attente |
| N-10 | Info | Données institutionnelles réelles absentes (coordonnées, photos, horaires) | À fournir par la HEC (voir `07_ACTIONS_UTILISATEUR.md`) |
