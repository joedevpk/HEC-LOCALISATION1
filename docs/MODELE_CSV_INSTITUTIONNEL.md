# Modèle CSV des données institutionnelles (bâtiments et salles)

Fichier : [`docs/modeles/modele_donnees_institutionnelles.csv`](modeles/modele_donnees_institutionnelles.csv)
(UTF-8 avec BOM, séparateur `;`, ouverture directe dans Excel en français). Procédure d'import : [IMPORT_CSV.md](IMPORT_CSV.md).

## Les deux lignes d'exemple sont FICTIVES et NON IMPORTABLES
- Leurs noms commencent par `EXEMPLE FICTIF` et leurs coordonnées valent `A_REMPLIR_…` : l'import les **refuse** (« coordonnées manquantes ou illisibles »).
  Un test automatique (`csv-template.test.ts`) vérifie que ce modèle ne peut jamais être importé tel quel.
- **Supprimez-les** avant d'ajouter vos lignes officielles. Ne remplacez jamais `A_REMPLIR_…` par des valeurs estimées.

## Champs
| Colonne | Statut | Bâtiment | Salle / lieu | À renseigner avec |
|---|---|---|---|---|
| `type` | **obligatoire** | `building` | `room` | — |
| `name` | **obligatoire** | nom officiel | nom officiel | document officiel de la HEC |
| `lng`, `lat` | **obligatoire** | longitude, latitude | idem (propres à la salle) | **mesure GPS terrain** (WGS84, 5-6 décimales), jamais déduite d'une carte ou d'un autre lieu |
| `code` | **obligatoire** pour un bâtiment, recommandé pour une salle | code unique | code de salle, unique dans son bâtiment | nomenclature officielle |
| `building_code` | **obligatoire** pour une salle | — | `code` d'un bâtiment (déjà en base ou présent dans le fichier) | — |
| `description` | facultatif | texte | — | — |
| `category` | facultatif | `academic` `library` `admin` `student_life` (défaut `academic`) | — | — |
| `floor_level` / `floor_name` | facultatif | — | entier (0 = rez-de-chaussée) / libellé | plan officiel |
| `kind` | facultatif | — | `room` `office` `service` `poi` `entrance` `exit` `facility` (défaut `room`) | — |
| `capacity` | facultatif | — | entier ≥ 0 | donnée confirmée uniquement |
| `location_accuracy` | facultatif | précision en mètres | — | indiquée par l'appareil de mesure |
| `is_accessible` | facultatif | — | `oui` / `non` (défaut `oui`) | constat sur place |

Nombres : décimaux simples uniquement (`15.301` ou `15,301`). Les notations `0x10`, `1e1`, `0b11` sont refusées.

## Statut des données importées
Toute ligne importée est créée **« en attente de validation »** (`data_source = import_csv`). Elle n'est jamais validée automatiquement :
un administrateur autorisé la valide après vérification de sa position sur la carte (onglet Données → lien « Vérifier sur la carte »).
