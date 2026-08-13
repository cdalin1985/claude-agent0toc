#!/usr/bin/env bash
#
# Turn PROD_DB_URL into a string a GitHub runner can actually connect with.
#
# The secret has held a *direct* connection string since 2026-06-26:
#
#   postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
#
# That host is IPv6-only and GitHub-hosted runners have no IPv6, so psql fails
# with "Network is unreachable" every single time. The cost was not one broken
# workflow: the daily drift check has been red since June without ever
# connecting, and migration 20260812050000 -- which stops a player renaming
# themselves on the ladder -- sat merged and unapplied because the workflow that
# applies migrations could not reach the database.
#
# The password in that string is correct. Only the host and the username shape
# are wrong: Supabase's session-mode pooler answers on IPv4 with the same
# credentials, namespacing the user as postgres.<ref>. So this rewrites
#
#   postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
#   -> postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres
#
# and the secret never has to be touched by hand.
#
# Two rules this follows deliberately:
#
#   1. Resolve the pooler host, do not guess it. The prefix has been both aws-0-
#      and aws-1- depending on when a project was created, and a wrong guess
#      fails exactly like a wrong password. Candidates come from the Management
#      API first, and every candidate is proved with a real connection before it
#      is used. A host that answers is a fact; a host that looks right is not.
#   2. Never print the password or the assembled URL. GitHub masks the secret's
#      exact value, not substrings of it, so the parsed password is masked
#      explicitly the moment it exists.
#
# Session mode (5432), never transaction mode (6543): migrations run DDL.
#
# Usage:   bash .github/scripts/resolve-prod-db-url.sh
# Env in:  PROD_DB_URL (required), SUPABASE_ACCESS_TOKEN (optional but needed
#          to resolve the pooler host), PROJECT_REF (optional override)
# Env out: PROD_DB_URL, written to $GITHUB_ENV, connection-tested
# Exit:    0 usable   2 secret not configured   1 configured but unusable

set -euo pipefail

fail() { echo "::error::$*"; exit 1; }

# A connection that runs a trivial query is the only evidence that counts.
probe() {
  PGCONNECT_TIMEOUT=10 psql "$1" -v ON_ERROR_STOP=1 -Atc 'select 1' >/dev/null 2>&1
}

publish() {
  local url="$1"
  echo "::add-mask::$url"
  {
    echo "PROD_DB_URL<<__RESOLVED_DB_URL__"
    echo "$url"
    echo "__RESOLVED_DB_URL__"
  } >> "${GITHUB_ENV:-/dev/stdout}"
}

if [ -z "${PROD_DB_URL:-}" ]; then
  echo "PROD_DB_URL is not set."
  exit 2
fi

# Anything that is not the known-broken direct host is taken at face value: it
# may be a pooler string, a bouncer, or a tunnel this script has never seen.
if [[ "$PROD_DB_URL" != *"db."*".supabase.co"* ]]; then
  if probe "$PROD_DB_URL"; then
    echo "PROD_DB_URL connects as configured; using it unchanged."
    publish "$PROD_DB_URL"
    exit 0
  fi
  fail "PROD_DB_URL is set but no connection could be opened with it. It is not the direct-host string this script knows how to repair, so it needs fixing by hand: Supabase dashboard -> Connect -> Session pooler (port 5432), then update the repo secret."
fi

# ---------------------------------------------------------------------------
# Direct host. Take it apart.
# ---------------------------------------------------------------------------
after_scheme="${PROD_DB_URL#*://}"

# Split on the LAST '@', not the first: a password may legitimately contain one.
userinfo="${after_scheme%@*}"
hostpart="${after_scheme##*@}"

password="${userinfo#*:}"
[ -n "$password" ] && [ "$password" != "$userinfo" ] || \
  fail "Could not read a password out of PROD_DB_URL. Expected postgresql://user:password@host:port/db."
echo "::add-mask::$password"

if [[ "$hostpart" =~ ^db\.([a-z0-9]+)\.supabase\.co ]]; then
  ref="${PROJECT_REF:-${BASH_REMATCH[1]}}"
else
  fail "PROD_DB_URL host did not match db.<ref>.supabase.co, so the project ref could not be read from it."
fi

echo "Rewriting the direct host for project $ref onto the session pooler."

# ---------------------------------------------------------------------------
# Candidate pooler hosts, best evidence first.
# ---------------------------------------------------------------------------
candidates=()

if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  pooler_json="$(curl -sS --max-time 30 \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/${ref}/config/database/pooler" 2>/dev/null || true)"
  [ -n "$pooler_json" ] || pooler_json='{}'
  # The endpoint has returned both a bare object and a one-element array.
  api_host="$(printf '%s' "$pooler_json" \
    | jq -r '(if type=="array" then .[0] else . end) | (.db_host // .host // empty)' \
    2>/dev/null || true)"
  if [ -n "$api_host" ] && [ "$api_host" != "null" ]; then
    candidates+=("$api_host")
  fi

  region="$(curl -sS --max-time 30 \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/${ref}" 2>/dev/null \
    | jq -r '.region // empty' 2>/dev/null || true)"
else
  region=""
fi

# Region-derived fallbacks, tried only if the API did not answer. Both prefixes
# are in service; neither is assumed correct, both are probed.
if [ -n "$region" ] && [ "$region" != "null" ]; then
  candidates+=("aws-0-${region}.pooler.supabase.com" "aws-1-${region}.pooler.supabase.com")
fi

if [ ${#candidates[@]} -eq 0 ]; then
  fail "No pooler host could be resolved for project ${ref}. The Management API was unreachable or SUPABASE_ACCESS_TOKEN is missing, and there is nothing else to derive it from. Fix by hand: Supabase dashboard -> Connect -> Session pooler (port 5432), then update the PROD_DB_URL secret."
fi

for host in "${candidates[@]}"; do
  candidate="postgresql://postgres.${ref}:${password}@${host}:5432/postgres"
  echo "::add-mask::$candidate"
  echo "  trying ${host}:5432 ..."
  if probe "$candidate"; then
    echo "::notice::PROD_DB_URL pointed at the IPv6-only direct host; rewritten onto ${host}:5432 for this run. Update the repo secret to the session-pooler string to make this permanent."
    publish "$candidate"
    exit 0
  fi
done

fail "PROD_DB_URL holds the IPv6-only direct host and no session-pooler host accepted its password (tried: ${candidates[*]}). Either the password has been rotated or the pooler is disabled. Fix by hand: Supabase dashboard -> Connect -> Session pooler (port 5432), then update the PROD_DB_URL secret."
