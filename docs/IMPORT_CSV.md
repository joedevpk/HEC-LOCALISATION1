# Import CSV de bâtiments et de salles

Administration → **Données** → **Import CSV**. Téléchargez le modèle, remplissez-le, chargez-le : le fichier est vérifié
**dans le navigateur**, vous voyez la prévisualisation, puis (si aucune erreur) vous confirmez. L'écriture se fait en **une seule
transaction côté serveur** (`import_campus_data`) : tout est enregistré, ou rien. Les lignes importées sont créées **« non validées »**
(`data_source = import_csv`) ; un administrateur doit les valider.

## Format
Encodage UTF-8, séparateur `;` ou `,`, première ligne = en-tête, 1 Mo, 500 bâtiments et 2000 salles maximum. Les coordonnées acceptent le
point ou la virgule décimale (`15,301` ou `15.301`).

| Colonne | Bâtiment | Salle | Règle |
|---|---|---|---|
| `type` | `building` | `room` | obligatoire |
| `name` | oui | oui | nom officiel, obligatoire |
| `code` | **oui** | recommandé | unique (insensible à la casse) ; pour une salle, unique dans son bâtiment |
| `building_code` | — | **oui** | code d'un bâtiment existant ou présent dans le fichier |
| `lng`, `lat` | **oui** | **oui** | WGS84, mesurés sur le terrain. **Jamais déduits**, (0,0) refusé |
| `description`, `category` | opt. | — | catégories : academic, library, admin, student_life (défaut academic) |
| `floor_level`, `floor_name` | — | opt. | entier ; l'étage est créé s'il n'existe pas |
| `kind` | — | opt. | room, office, service, poi, entrance, exit, facility (défaut room) |
| `capacity` | — | opt. | entier ≥ 0 |
| `location_accuracy` | opt. | — | précision des coordonnées en mètres |
| `is_accessible` | — | opt. | oui/non (défaut oui) |

## Contrôles
- **Erreurs bloquantes** (rien n'est écrit tant qu'il en reste) : type/colonne inconnus, nom manquant, coordonnées manquantes/invalides/hors plage/(0,0),
  doublon dans le fichier, bâtiment introuvable pour une salle, valeur hors liste.
- **Doublons avec la base** : ligne **ignorée** et signalée (la base re-vérifie et refuse toute l'importation en cas de doublon).
- **Avertissements** : position identique au centre du campus (position dérivée ?), à plus de 5 km (longitude/latitude inversées ?), même position qu'une autre ligne.
- Limite connue : une salle **doit** avoir ses propres coordonnées (le schéma actuel les impose) ; une salle sans coordonnées mesurées ne peut pas être importée.
