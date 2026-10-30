#!/usr/bin/env bash
# Scénarios de migration sur PostgreSQL LOCAL de test (jamais en production).
#   S1  base neuve SANS campus                      → toute la chaîne passe, aucune donnée fictive
#   S2  base neuve AVEC campus                      → idem, le campus existant n'est pas touché
#   S3  base contenant déjà des données réelles     → données conservées, rien de « validé », rien d'ajouté
#   S4  base déjà migrée (ancienne chaîne, démo appliquée) → seule la nouvelle migration s'applique ;
#       la démo existante reste identifiée « seed_demo » ; la nouvelle migration est rejouable
#   S5  activation VOLONTAIRE de la démo            → insérée, marquée seed_demo, jamais validée
# Usage (depuis la racine du dépôt) :  runuser -u postgres -- bash supabase/tests/20_scenarios.sh
# Variable facultative : OLD_MIGRATIONS=<dossier d'une ancienne chaîne> pour S4 (sinon S4 est sauté et signalé).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../supabase/migrations"
STUBS="$HERE/00_supabase_stubs.sql"
PASS=0; FAIL=0
ok()  { echo "PASS  $1"; PASS=$((PASS+1)); }
bad() { echo "FAIL  $1  [$2]"; FAIL=$((FAIL+1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "attendu=$3 obtenu=$2"; fi; }
q() { psql -At -v ON_ERROR_STOP=1 -d "$1" -c "$2" 2>/dev/null; }
newdb() { psql -q -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1" >/dev/null 2>&1; psql -q -d "$1" -f "$STUBS" >/dev/null 2>&1; }
apply() { # apply <db> <fichier> → code retour 0/1, message d'erreur dans /tmp/mig_err.txt
  psql -q -v ON_ERROR_STOP=1 -d "$1" -f "$2" >/dev/null 2>/tmp/mig_err.txt; }
apply_chain() { # apply_chain <db> <dossier> [hook_après_première_migration]
  local db="$1" dir="$2" hook="${3:-}" n=0 f
  for f in $(ls "$dir"/*.sql | sort); do
    if ! apply "$db" "$f"; then echo "   échec: $(basename "$f"): $(grep -m1 -i error /tmp/mig_err.txt)"; return 1; fi
    n=$((n+1)); if [ "$n" = 1 ] && [ -n "$hook" ]; then eval "$hook"; fi
  done
}

echo "=== S1 : base neuve sans campus"
newdb hec_s1
if apply_chain hec_s1 "$MIG"; then ok "S1 la chaîne complète s'applique sans campus"; else bad "S1 chaîne" "voir ci-dessus"; fi
check "S1 aucun bâtiment fictif inséré" "$(q hec_s1 "SELECT count(*) FROM buildings")" "0"
check "S1 aucun lieu fictif inséré" "$(q hec_s1 "SELECT count(*) FROM locations")" "0"
check "S1 aucun campus inventé" "$(q hec_s1 "SELECT count(*) FROM campuses")" "0"

echo "=== S2 : base neuve avec campus"
newdb hec_s2
HOOK="psql -q -d hec_s2 -c \"INSERT INTO campuses (name) VALUES ('Campus de test')\" >/dev/null 2>&1"
if apply_chain hec_s2 "$MIG" "$HOOK"; then ok "S2 la chaîne complète s'applique avec un campus"; else bad "S2 chaîne" "voir ci-dessus"; fi
check "S2 le campus existant est intact" "$(q hec_s2 "SELECT count(*)||'/'||min(name) FROM campuses")" "1/Campus de test"
check "S2 la démo n'est PAS insérée silencieusement" "$(q hec_s2 "SELECT count(*) FROM buildings")" "0"

echo "=== S3 : base contenant déjà des données"
newdb hec_s3
HOOK3="psql -q -d hec_s3 -c \"INSERT INTO campuses (id,name) VALUES ('00000000-0000-4000-8000-0000000000c1','Campus réel test')\" >/dev/null 2>&1"
# on applique tout jusqu'à la migration d'archivage, on insère des données, puis on applique la suite
for f in $(ls "$MIG"/*.sql | sort | awk '$0 < "'"$MIG"'/20260903100000"'); do apply hec_s3 "$f" || { bad "S3 pré-migrations" "$(basename $f)"; break; }; done
eval "$HOOK3"
psql -q -d hec_s3 -c "INSERT INTO buildings (id,campus_id,name,code,center_lng,center_lat) VALUES ('00000000-0000-4000-8000-00000000b0a1','00000000-0000-4000-8000-0000000000c1','Bâtiment réel test','R1',15.31,-4.31)" >/dev/null 2>&1
psql -q -d hec_s3 -c "INSERT INTO locations (building_id,name,code,lng,lat) VALUES ('00000000-0000-4000-8000-00000000b0a1','Salle réelle test','R1-1',15.31,-4.31)" >/dev/null 2>&1
REST_OK=1
for f in $(ls "$MIG"/*.sql | sort | awk '$0 >= "'"$MIG"'/20260903100000"'); do
  apply hec_s3 "$f" || { REST_OK=0; bad "S3 migration $(basename $f)" "$(grep -m1 -i error /tmp/mig_err.txt)"; }
done
[ "$REST_OK" = 1 ] && ok "S3 les migrations suivantes s'appliquent sur une base déjà remplie"
check "S3 aucun bâtiment ajouté (1 réel conservé)" "$(q hec_s3 "SELECT count(*) FROM buildings")" "1"
check "S3 la donnée réelle est inchangée" "$(q hec_s3 "SELECT name||'|'||code FROM buildings")" "Bâtiment réel test|R1"
check "S3 rien n'est validé automatiquement" "$(q hec_s3 "SELECT count(*) FROM buildings WHERE verification_status<>'pending'")" "0"
check "S3 aucune ligne marquée démo" "$(q hec_s3 "SELECT count(*) FROM buildings WHERE data_source='seed_demo'")" "0"

echo "=== S4 : base déjà migrée avec l'ANCIENNE chaîne (démo appliquée)"
if [ -n "${OLD_MIGRATIONS:-}" ] && [ -d "$OLD_MIGRATIONS" ]; then
  newdb hec_s4
  HOOK4="psql -q -d hec_s4 -c \"INSERT INTO campuses (name) VALUES ('Campus prod simulé')\" >/dev/null 2>&1"
  if apply_chain hec_s4 "$OLD_MIGRATIONS" "$HOOK4"; then ok "S4 ancienne chaîne appliquée (état « production »)"; else bad "S4 ancienne chaîne" "voir ci-dessus"; fi
  check "S4 (état initial) la démo ancienne est présente et marquée seed_demo" "$(q hec_s4 "SELECT count(*) FROM buildings WHERE data_source='seed_demo'")" "1"
  NEW="$MIG/20261028090000_role_hierarchy_guard.sql"
  if apply hec_s4 "$NEW"; then ok "S4 seule la nouvelle migration s'applique"; else bad "S4 nouvelle migration" "$(grep -m1 -i error /tmp/mig_err.txt)"; fi
  if apply hec_s4 "$NEW"; then ok "S4 la nouvelle migration est rejouable (idempotente)"; else bad "S4 rejeu" "$(grep -m1 -i error /tmp/mig_err.txt)"; fi
  # rejouer aussi la migration de démo MODIFIÉE sur cette base : elle ne doit rien changer
  psql -q -d hec_s4 -c "UPDATE buildings SET name='Nom modifié par un admin' WHERE data_source='seed_demo'" >/dev/null 2>&1
  apply hec_s4 "$MIG/20260903100000_seed_example_building_and_room.sql"
  check "S4 le rejeu de la démo (inactive) n'écrase pas une modification faite depuis" "$(q hec_s4 "SELECT name FROM buildings WHERE data_source='seed_demo'")" "Nom modifié par un admin"
  check "S4 la démo existante reste identifiable (seed_demo) et non validée" "$(q hec_s4 "SELECT verification_status FROM buildings WHERE data_source='seed_demo'")" "pending"
else
  echo "SKIP  S4 (définir OLD_MIGRATIONS=<ancienne chaîne> pour l'exécuter)"
fi

echo "=== S5 : activation volontaire de la démo (base de démonstration)"
newdb hec_s5
HOOK5="psql -q -d hec_s5 -c \"INSERT INTO campuses (name) VALUES ('Campus démo')\" >/dev/null 2>&1"
apply_chain hec_s5 "$MIG" "$HOOK5" >/dev/null
{ echo "SET hec.allow_demo_seed = 'on';"; cat "$MIG/20260903100000_seed_example_building_and_room.sql"; } > /tmp/demo_on.sql
if apply hec_s5 /tmp/demo_on.sql; then ok "S5 la démo s'insère quand on l'active explicitement"; else bad "S5 insertion" "$(grep -m1 -i error /tmp/mig_err.txt)"; fi
check "S5 bâtiment de démo présent" "$(q hec_s5 "SELECT count(*) FROM buildings WHERE id='00000000-0000-4000-a000-000000000b01'")" "1"
check "S5 marqué seed_demo (même exécuté après la migration de provenance)" "$(q hec_s5 "SELECT data_source FROM buildings WHERE id='00000000-0000-4000-a000-000000000b01'")" "seed_demo"
check "S5 salle de démo marquée seed_demo" "$(q hec_s5 "SELECT count(*) FROM locations WHERE data_source='seed_demo'")" "2"
check "S5 jamais validée automatiquement" "$(q hec_s5 "SELECT count(*) FROM buildings WHERE verification_status='validated'")" "0"

echo
echo "Bilan scénarios : $PASS réussis, $FAIL échecs"
[ "$FAIL" = 0 ]
