# TOC workspace boundary

This setup is exclusively for `cdalin1985/claude-agent0toc`. Never inspect,
use, or modify another league's resources. Ask for missing TOC identifiers;
do not discover them by listing unrelated projects.

## Resource verification, 2026-09-12

- Checkout: `D:/documents/claude-agent0toc`.
- GitHub API confirms `cdalin1985/claude-agent0toc`, default branch `main`.
  Signed-in GitHub user: `cdalin1985`.
- Vercel API confirms project `toc-app`, ID `prj_cpSNmnjRXFK14Jadp2yU4tEghDFQ`,
  account/team `team_JIGWMVABx7X7cCpDMuWcujgZ`. The exact team API confirms
  slug `cdalin-projects`, name `cdalin1985`, and owner membership.
- Supabase exact-project API independently confirms `toc1`, reference
  `ankvjywsnydpkepdvuvm`, organization `euguycqsxfnzrjisisiy`, region
  `us-west-2`, and status `ACTIVE_HEALTHY`. The local link and frontend URL
  match this reference. Verification succeeded after connector reconnection;
  only project metadata was requested, with no database or production writes.

## Local checks and protection

```powershell
cd D:\documents\claude-agent0toc
rtk proxy npm.cmd run workspace:check
rtk proxy npm.cmd run dev -- --host 127.0.0.1
```

The check runs inside npm dev/preview and through the local pre-commit
hook. The portable build command does not require ignored local provider links
or local environment files, so fresh CI and hosted build checkouts can build.
Run `npm run workspace:check` explicitly before a local build.
It checks every Git remote, Supabase/Vercel link IDs, environment URLs,
legacy browser key project/role, privileged VITE variables, and tracked or
staged local environment/provider files. It prints no key values. Missing or
mismatched links fail closed. The dev/preview entry point forwards the same
arguments to the checker and Vite. Custom modes supplied with `--mode MODE`,
`--mode=MODE`, or `-m MODE` are checked automatically before Vite starts.

Environment files remain local and ignored; only the existing root
`.env.example` template may be tracked. Never put real secrets in that template.
Do not overwrite or pull environment files during routine setup. Never use
`git add -f` for local environment or provider files.

These are local workflow checks, not a security sandbox: direct CLI calls and
Git's `--no-verify` can bypass them. They do not authorize deployment, migration,
push, or any production write. The current frontend environment points at
hosted TOC; interacting with it may change production. Verification during this
setup must only build/serve local assets, without logging in or exercising data
actions. Ask for an explicitly approved TOC development project before changing
the backend target.

## Existing work

Setup branch: `codex/toc-workspace-boundaries`. Existing `CLAUDE.md` edits and
untracked `.claude/tmp/` content belong to the user and must remain untouched.
The user authorized committing, pushing this setup branch, and opening a draft
PR. Deployment, migration, merge, and production mutations remain outside this
setup. `vercel.json` disables automatic deployments only for
`codex/toc-workspace-boundaries` so publishing the branch does not deploy it.

Local hook installation: `git config --local core.hooksPath .githooks`.
For another checkout, first verify its remote/status and existing hook settings;
do not replace an existing hook arrangement without reviewing it.

## Verification results

- Local boundary check passed; process-only tests rejected a mismatched remote,
  mismatched Supabase URL, and a privileged browser key without changing files.
- ESLint and both TypeScript project checks passed. TypeScript incremental
  output was disabled to preserve existing dependency-directory caches.
- Vite production build passed with output under the Windows temporary folder;
  the repository's existing `dist` and lockfile were not changed.
- Local Vite startup passed, and `/` plus `/src/main.tsx` returned HTTP 200.
  This verifies local asset serving, not authenticated application workflows.
- `git diff --check` passed. Independent Supabase verification passed after
  reconnection; the local boundary check also passed again.

## Pre-commit review corrections

- Removed the local-only `prebuild` hook. The unchanged `tsc -b && vite build`
  command passed in a temporary source copy with no environment files or
  provider links. Only the copy's TypeScript cache paths were redirected, and
  Vite used its native config loader to preserve the original dependency cache.
  This proves build portability locally; no hosted build or deployment was run.
- Dev and preview now use `scripts/local-vite.mjs`, which checks the same mode
  arguments before launching Vite. Regression tests invoke the real npm scripts
  in a temporary TOC fixture and verify all three mode option forms reject a
  mismatched URL before Vite starts. Positive help invocations also pass.
- The regression test, lint, workspace check, and whitespace check passed.
  GitNexus reports low risk for indexed tracked changes; it does not cover the
  new untracked scripts, which were reviewed directly and tested separately.
