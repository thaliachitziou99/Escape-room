#!/usr/bin/env bash
# Applies every migration to a SCRATCH Postgres database (with test stubs for Supabase's auth/storage/realtime) and runs the DB tests.
# Usage: PGHOST=/var/tmp/pg16 PGPORT=54329 PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${DB:-e13_test}
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
for f in supabase/tests/stubs.sql supabase/migrations/*.sql supabase/tests/part7.sql supabase/tests/part7_versions.sql supabase/tests/part8.sql; do
  echo "== $f"; psql -v ON_ERROR_STOP=1 -q -o /dev/null -d "$DB" -f "$f"
done
echo "DB TESTS PASSED"
