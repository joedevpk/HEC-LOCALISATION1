# Utiliser la CLI Supabase avec la structure de ce dépôt

Les migrations et la fonction Edge sont dans `supabase/supabase/` (et non `supabase/`). **Test réalisé avec la CLI 2.122.0** :

| Commande lancée depuis | Dossier de migrations utilisé | Voit les migrations existantes ? |
|---|---|---|
| la racine du projet (`supabase migration new x`) | `supabase/migrations/` | **Non** (crée un dossier vide à côté) |
| la racine, avec `--workdir supabase` | `supabase/supabase/migrations/` | **Oui** |
| le dossier `supabase/` | `supabase/supabase/migrations/` | **Oui** |

**Règle** : toujours `supabase --workdir supabase <commande>` depuis la racine (ou se placer dans `supabase/`).
```bash
supabase --workdir supabase link --project-ref <ref>
supabase --workdir supabase migration list
supabase --workdir supabase db push --dry-run     # puis db push, après sauvegarde
supabase --workdir supabase functions deploy route-walking
```
Les fichiers n'ont **pas** été déplacés : cela évite les doublons et conserve l'historique et les horodatages. Un déplacement vers `supabase/migrations/` (structure standard) reste possible plus tard, avec `git mv`, en une seule opération contrôlée.
Ne jamais lancer `supabase db reset` sur un projet contenant des données. Les scripts de retour arrière sont dans `supabase/supabase/rollback/` (volontairement hors du dossier des migrations).
