#!/usr/bin/env bash
# Rejoue TOUTES les migrations dans l'ordre sur un PostgreSQL LOCAL de test (jamais en production),
# puis exécute les tests de permissions. Prérequis : PostgreSQL installé (ex. `apt install postgresql`).
# Usage : sudo -u postgres bash supabase/tests/run_local.sh   (depuis la racine du dépôt)
set -euo pipefail
DB=${DB:-hectest}
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../supabase/migrations"
psql -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" 2>/dev/null
P="psql -q -v ON_ERROR_STOP=1 -d $DB"
$P -f "$HERE/00_supabase_stubs.sql" >/dev/null 2>&1
for f in $(ls "$MIG"/*.sql | sort); do
  case "$f" in
    *seed_example_building_and_room*)
      # Cette migration de DÉMO exige un campus existant (sinon elle lève une erreur et bloque la suite).
      $P -c "INSERT INTO campuses (name) SELECT 'Campus test' WHERE NOT EXISTS (SELECT 1 FROM campuses)" >/dev/null ;;
  esac
  echo "migration: $(basename "$f")"
  $P -f "$f" >/dev/null 2>&1
done
echo "--- second passage de la dernière migration (idempotence)"
$P -f "$(ls "$MIG"/*.sql | sort | tail -1)" >/dev/null 2>&1 && echo "idempotente: OK"
psql -q -d $DB -f "$HERE/10_permissions.sql" 2>&1 | grep -v NOTICE | tee /tmp/perm_out.txt
! grep -q "^ FAIL" /tmp/perm_out.txt
