#!/usr/bin/env bash
# Compare this repo's migration files against the versions production has
# recorded, in BOTH directions.
#
# Lives in a script rather than inline in the workflow so it can be run against
# fixtures. The previous version of this comparison was inline, could not be
# exercised, and reported "no drift" for two months while it was unable to
# connect to the database at all. A check nobody can test is a check nobody
# knows the state of.
#
# usage: compare-migrations.sh <migrations_dir> <remote_versions_file> <allowlist_file> [cutoff]
#
#   migrations_dir       directory of NNNNNNNNNNNNNN_name.sql files
#   remote_versions_file file of version strings, one per line, as recorded in
#                        supabase_migrations.schema_migrations
#   allowlist_file       production-only versions that are expected to have no
#                        file, one `<version> <name>` per line, # for comments
#   cutoff               versions >= this are too recent to flag as undeployed;
#                        defaults to 30 minutes ago
#
# exit 0  no drift
# exit 1  drift found (details on stdout as ::error:: annotations)
# exit 2  bad usage / unreadable input

set -uo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: compare-migrations.sh <migrations_dir> <remote_versions_file> <allowlist_file> [cutoff]" >&2
  exit 2
fi

migrations_dir=$1
remote_file=$2
allowlist_file=$3
cutoff=${4:-$(date -u -d '30 minutes ago' +%Y%m%d%H%M%S 2>/dev/null || date -u -v-30M +%Y%m%d%H%M%S)}

for path in "$migrations_dir" "$remote_file" "$allowlist_file"; do
  if [ ! -e "$path" ]; then
    # Refusing rather than skipping. An unreadable allowlist that silently
    # passed would turn every orphan into a non-finding, which is the exact
    # shape of failure this whole file exists to prevent.
    echo "::error::compare-migrations: cannot read '$path'" >&2
    exit 2
  fi
done

local_versions=$(ls "$migrations_dir" | grep -oE '^[0-9]+' | sort -u)
remote_versions=$(grep -oE '^[0-9]+' "$remote_file" | sort -u)
allowed=$(grep -oE '^[0-9]+' "$allowlist_file" | sort -u)

if [ -z "$remote_versions" ]; then
  # An empty answer used to be read as "production has no migrations", which
  # made every repo migration look undeployed. It means the query failed.
  echo "::error::compare-migrations: no versions read from '$remote_file'. Treating an empty result as failure, not as an empty database." >&2
  exit 2
fi

status=0

# ---------------------------------------------------------------- forward ---
# Merged here, never applied there. This is the original check: a merged
# migration file is not a deployed migration.
missing=""
for v in $local_versions; do
  if ! grep -qx "$v" <<< "$remote_versions"; then
    # Migrations merged in the last half hour are expected to lag the deploy.
    if [ "$v" -lt "$cutoff" ]; then
      missing="$missing $v"
    fi
  fi
done

if [ -n "$missing" ]; then
  echo "::error::Migrations merged to main but NOT applied to production:$missing"
  echo "Run migration-apply.yml (or 'supabase db push') against production, then re-run this check."
  status=1
else
  echo "No deploy drift: all repo migrations are present in production."
fi

# ---------------------------------------------------------------- reverse ---
# Applied there, no file here. Ignored until 2026-08-13, which is how
# production reached 69 recorded migrations against 41 files -- including the
# player activation system, whose absence meant the database could not be
# rebuilt from this repo and nothing said so.
orphans=""
for v in $remote_versions; do
  if ! grep -qx "$v" <<< "$local_versions" && ! grep -qx "$v" <<< "$allowed"; then
    orphans="$orphans $v"
  fi
done

if [ -n "$orphans" ]; then
  echo "::error::Production has migrations with NO file in this repo:$orphans"
  echo "The database can no longer be rebuilt from this repo alone."
  echo "Write the change as a migration file and apply it through migration-apply.yml."
  echo "Only add it to $allowlist_file if it genuinely should have no file, and say why."
  status=1
else
  echo "No reverse drift: every production migration is either in this repo or documented as orphaned."
fi

# --------------------------------------------------------------- hygiene ---
# An allowlist entry that is no longer orphaned is stale: either the file was
# written after all, or the version is gone from production. Left alone it
# would quietly excuse a version that comes back later under the same number.
stale=""
for v in $allowed; do
  if grep -qx "$v" <<< "$local_versions"; then
    stale="$stale ${v}(now-has-a-file)"
  elif ! grep -qx "$v" <<< "$remote_versions"; then
    stale="$stale ${v}(not-in-production)"
  fi
done

if [ -n "$stale" ]; then
  echo "::error::Stale entries in $allowlist_file:$stale"
  echo "Remove them. An allowlist that excuses versions which are no longer orphaned will excuse a future one by accident."
  status=1
fi

exit "$status"
