# TOC local onboarding

Use [AGENTS.md](../AGENTS.md) first and [workspace setup](workspace-setup.md) for
the existing guard design. This guide is for `D:/documents/claude-agent0toc` only.
No other league's skills, files, history, accounts, or resources are inputs.
Verify cwd, remote, branch, and status before work; preserve existing edits.

## Exact allowlist and live verification

Metadata independently verified on 2026-09-12; repeat scoped reads before cloud work.
Names alone, old documentation, and local link files are not identity proof.

| Resource | Allowed identity | Read-only verification |
| --- | --- | --- |
| GitHub | `cdalin1985/claude-agent0toc`; production branch `main` | Get this repository and signed-in user; compare both. Verified login: `cdalin1985`. |
| Supabase | `toc1`, ref `ankvjywsnydpkepdvuvm`, organization `euguycqsxfnzrjisisiy`, region `us-west-2` | `get_project` with this exact ref; verify name, ref, organization and status. Result: `ACTIVE_HEALTHY`. |
| Vercel | `toc-app`, ID `prj_cpSNmnjRXFK14Jadp2yU4tEghDFQ` | `get_project` with this ID and the exact team ID; verify GitHub link and production branch. |
| Vercel team | `team_JIGWMVABx7X7cCpDMuWcujgZ`, slug `cdalin-projects`, name `cdalin1985` | Authenticated GET `/v2/teams/team_JIGWMVABx7X7cCpDMuWcujgZ`; report only ID, slug, name and membership. Verified role: OWNER. |
| Frontend / API | `https://toc.monster` / `https://ankvjywsnydpkepdvuvm.supabase.co` | Match the project metadata and local browser environment; do not infer ownership from a responding URL. |

Stop on a mismatch, missing identifier, or access denial and ask the user for
the correct TOC identifier/access. Never enumerate unrelated projects, change
accounts/projects, or try different credentials/tools to bypass denial. If a tool
is unavailable rather than denied, an equivalent authenticated read of the exact
allowlisted resource is acceptable. Never dump full API responses containing
tokens, billing details, or personal data. No credentials belong in skills or Git.

## One readiness command

```powershell
cd D:\documents\claude-agent0toc
rtk proxy npm.cmd run toc:readiness
```

[The command](../scripts/toc-readiness.mjs) makes no network requests or file
writes, installs nothing, and starts no services. It reports branch/dirty state,
checks direct dependencies against the lockfile, required files, local hook
configuration, and reuses [workspace:check](../scripts/check-workspace.mjs) for
remote/link/environment protections. Pass `-- --mode staging` to include a
custom mode. Failure exits nonzero and never repairs or relinks automatically.
LOCAL PASS is not proof of cloud authorization, database migration state, or
working notifications. Perform the exact metadata checks above separately.

Use Node 24.x (verified Vercel setting); CI uses Node 22, with 22.18+ needed for
the documented native TypeScript tests. Dependencies already exist locally.
If absent/mismatched, ask before installing or updating them. Do not run
`scripts/cloud-setup.sh` as a check: it installs dependencies with `npm ci`.

## Local development uses production data

**Yes: the current local app uses the production `toc1` backend.**
[The client](../src/lib/supabase.ts) reads `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`; `.env.local` targets the allowlisted hosted API.
Localhost and a Vercel preview do not imply an isolated database. No separate
TOC test backend has been approved or provisioned. Do not change targets to one
without user-supplied identifiers, independent verification, and authorization.

Inspect required/optional variable names in [.env.example](../.env.example).
Keep actual values in ignored local files. Never print environment files or
put service-role/secret keys in `VITE_*`. Check optional VAPID/Sentry/payment
configuration only for the requested feature; readiness does not promise them.
Environment edits, cloud env pulls, link changes, installs, and secret rotation
require explicit scope. Restart Vite after an authorized env change.

To start local assets when local development is requested:

```powershell
cd D:\documents\claude-agent0toc
rtk proxy npm.cmd run dev -- --host 127.0.0.1 --configLoader native
```

The native config loader avoids a bundled config cache in `node_modules`.
Do not log in, claim a player, send a push, or exercise data actions merely to
prove the server starts. Stop the server with Ctrl+C when the check is complete.

## Safe checks and QA approval

These commands lint/typecheck or run inspected local behavior tests; they make
no production requests. TypeScript incremental output is disabled here.

```powershell
cd D:\documents\claude-agent0toc
rtk proxy npm.cmd run lint
rtk proxy node node_modules/typescript/bin/tsc -p tsconfig.app.json --incremental false
rtk proxy node node_modules/typescript/bin/tsc -p tsconfig.node.json --incremental false
rtk proxy node --test test/identity-routing.test.mjs test/league-time.test.mjs
rtk git diff --check
```

For a change, run the affected local tests after inspecting their side effects.
The full `npm test` suite includes temporary fixture writes. `npm run build`
writes `dist` and TypeScript caches; use an authorized temporary source copy
with cache/output redirected when root instructions prohibit those writes.
For migration changes, [verify-db.sh](../scripts/verify-db.sh) requires Bash,
Docker, and psql, and creates/recreates `toc_verify` in local `toc-verify-pg`
(Postgres 17, default port 55432). It is a destructive **local disposable DB**
test, not the read-only readiness command. Confirm that exact container is
disposable and authorize local provisioning before running it. Never substitute
hosted `toc1`. No migration changes or replay are part of this skills setup.

Use [toc-production-qa](../.agents/skills/toc-production-qa/SKILL.md) for role and
mobile coverage. Obtain approval before tests that change production data,
sessions, notification subscriptions, messages, rankings, stats, or treasury.
Approval must cover named test identities, actions/recipients, expected effects,
and cleanup. Reversing/deleting test data is also a mutation. A rejected-write
test can still have side effects. Guest navigation must avoid write-on-load routes.

## Release and rollback boundaries

Read [toc-release](../.agents/skills/toc-release/SKILL.md) before a release.
Vercel's verified Git link deploys `main` to TOC; feature pushes may auto-deploy.
The existing exclusion in [vercel.json](../vercel.json) applies only to
`codex/toc-workspace-boundaries`, NOT `codex/toc-local-skills`.
[Migration apply](../.github/workflows/migration-apply.yml) runs on main pushes
or dispatch. [Function deploy](../.github/workflows/deploy-edge-functions.yml)
runs on relevant main pushes or dispatch and deploys all explicitly listed
functions with their JWT flags. [Drift checks](../.github/workflows/migration-deploy-check.yml)
follow migration apply; they are not a substitute for applying or runtime testing.
No `supabase/config.toml` exists in this checkout; do not invent one or infer its
settings. Release approval must cover all triggered automation, not just Git merge.

Before an explicitly approved release, record exact commit/deployment IDs, migration
versions, function inventory/JWT settings, compatibility, recovery targets, and
acceptance evidence. Plan frontend/database/function changes separately.

- **Frontend:** with rollback approval, verify a previously working deployment
  belongs to the exact Vercel project/team and is compatible with the current DB
  and functions. Use Vercel's supported rollback after checking current CLI help;
  verify domain, deployment SHA, actual behavior, and PWA/cache freshness afterward.
- **Functions:** with approval, redeploy the verified prior TOC source for the
  affected functions, preserving JWT settings and compatibility. The existing
  all-functions workflow has a broader impact than a single-function rollback.
- **Database:** prefer a reviewed compensating/forward migration after local
  replay. Reverting a Git commit or frontend deployment does not undo applied SQL.
  Backups/PITR availability and recovery points are unverified prerequisites;
  never promise restore, drop schema, rewrite migration history, or undo ledger
  data blindly. Any restore requires explicit target/time/data-loss approval.

Preserve configured Git author/committer identity; never invent attribution or
include pre-existing edits in a commit. This skills task permits local creation
and verification only: no commit, push, merge, release, cloud setting changes,
provisioning, or production mutation is implied.

## Existing material and skills

Use [SETUP.md](../SETUP.md), [TESTING.md](../TESTING.md), and the
[admin rehearsal](release/admin-rehearsal-script.md) as historical coverage leads,
not commands to execute unchanged. They include provisioning/write steps and stale
migration, scheduling, and season assumptions. README wash wording conflicts with
root canon; flag it before related rule work rather than silently choosing a rule.

The five repository-local entrypoints are
[toc-bootstrap](../.agents/skills/toc-bootstrap/SKILL.md),
[toc-incident-diagnostics](../.agents/skills/toc-incident-diagnostics/SKILL.md),
[toc-production-qa](../.agents/skills/toc-production-qa/SKILL.md),
[toc-release](../.agents/skills/toc-release/SKILL.md), and
[toc-rule-change](../.agents/skills/toc-rule-change/SKILL.md).
Use their `$toc-...` names when discovered by the client; if the active session
has not refreshed its skill list, open the exact local SKILL.md rather than
claiming it has loaded. Only these five authored skill files are Git-allowlisted;
generated state under `.agents/` stays ignored.
