#!/usr/bin/env bash
# Replay every migration against a throwaway Postgres and run the runtime
# assertions. This is the local twin of .github/workflows/migration-replay-check.yml
# -- same shim, same migrations, same asserts -- so a green run here means a
# green run there.
#
#   ./scripts/verify-db.sh
#
# Needs Docker. Everything else it manages itself: it starts the container if it
# is missing or stopped, and drops/recreates the database on each run so the
# replay is always from scratch.
#
# Nothing here touches a live database. The container is local, disposable, and
# named toc-verify-pg; remove it with `docker rm -f toc-verify-pg`.

set -euo pipefail

CONTAINER=toc-verify-pg
# Deliberately not 5432: never collide with a Postgres the developer is running.
PORT=${TOC_VERIFY_PORT:-55432}
# Match production's major version, or the replay proves the wrong thing.
IMAGE=postgres:17
DB=toc_verify

cd "$(dirname "$0")/.."

# psql is not on PATH in a default Windows Postgres install.
if ! command -v psql >/dev/null 2>&1; then
  for candidate in "/c/Program Files/PostgreSQL"/*/bin; do
    if [ -x "$candidate/psql.exe" ]; then PATH="$candidate:$PATH"; break; fi
  done
fi
command -v psql >/dev/null 2>&1 || { echo "psql not found on PATH." >&2; exit 1; }

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and try again." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "==> starting $CONTAINER"
    docker start "$CONTAINER" >/dev/null
  else
    echo "==> creating $CONTAINER on port $PORT"
    docker run -d --name "$CONTAINER" \
      -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" "$IMAGE" >/dev/null
  fi
fi

export PGPASSWORD=postgres
PSQL="psql -h localhost -p $PORT -U postgres -v ON_ERROR_STOP=1"

echo "==> waiting for postgres"
for _ in $(seq 1 30); do
  if $PSQL -d postgres -c 'select 1' >/dev/null 2>&1; then break; fi
  sleep 2
done
$PSQL -d postgres -c 'select 1' >/dev/null

echo "==> recreating $DB"
$PSQL -d postgres -q -c "DROP DATABASE IF EXISTS $DB WITH (FORCE);" -c "CREATE DATABASE $DB;"

echo "==> supabase shim"
$PSQL -d "$DB" -q -f supabase/tests/migrations/00_supabase_shim.sql >/dev/null

echo "==> replaying migrations"
count=0
for f in $(ls supabase/migrations/*.sql | sort); do
  $PSQL -d "$DB" -q -f "$f"
  count=$((count + 1))
done
echo "    $count migrations applied"

echo "==> runtime assertions"
for t in supabase/tests/migrations/[0-9][0-9]_*_assert.sql; do
  # ON_ERROR_STOP makes a failed assertion a non-zero exit; 'set -e' then
  # aborts the run. Piping to grep would hide that behind grep's status, so the
  # exit code is captured explicitly.
  if ! out=$($PSQL -d "$DB" -f "$t" 2>&1); then
    echo "$out"
    echo "==> FAILED: $t" >&2
    exit 1
  fi
  echo "$out" | grep -E 'NOTICE|ERROR' || true
done

echo "==> re-applying the newest migrations (they must be idempotent)"
# Only the new ones: the December 2025 migrations target a schema the March 2026
# rebuild replaced, so replaying the whole history fails by design. A migration
# history runs once, in order, on a fresh database.
newest=$(ls supabase/migrations/20260807*.sql | sort)
for f in $newest; do
  $PSQL -d "$DB" -q -f "$f"
done

echo "==> runtime assertions again, after re-application"
for t in supabase/tests/migrations/[0-9][0-9]_*_assert.sql; do
  # ON_ERROR_STOP makes a failed assertion a non-zero exit; 'set -e' then
  # aborts the run. Piping to grep would hide that behind grep's status, so the
  # exit code is captured explicitly.
  if ! out=$($PSQL -d "$DB" -f "$t" 2>&1); then
    echo "$out"
    echo "==> FAILED: $t" >&2
    exit 1
  fi
  echo "$out" | grep -E 'NOTICE|ERROR' || true
done

echo "==> OK"
