---
name: toc-bootstrap
description: Verify or diagnose local setup for the TOC repository, dependencies, frontend environment, and exact TOC provider connections.
---

# TOC bootstrap

Read [root instructions](../../../AGENTS.md) and [TOC onboarding](../../../docs/toc-onboarding.md).
Allow only `cdalin1985/claude-agent0toc`, Supabase `ankvjywsnydpkepdvuvm`
(`toc1`, organization `euguycqsxfnzrjisisiy`), and Vercel
`prj_cpSNmnjRXFK14Jadp2yU4tEghDFQ` (`toc-app`) in
`team_JIGWMVABx7X7cCpDMuWcujgZ` (`cdalin-projects`).
Never inspect or reuse another league's resources. Stop on mismatch or access
denial; ask for the missing identifier/access. Do not switch accounts/projects
or use another credential/tool to bypass denial.

1. Verify cwd, every fetch/push remote, branch, status, and root instructions
   before project work. Preserve edits; use a suitable local branch for changes.
2. Run the readiness command below. Reuse [the boundary checker](../../../scripts/check-workspace.mjs)
   and [local Vite entrypoint](../../../scripts/local-vite.mjs); do not build duplicates.
3. Independently verify exact resource metadata using the onboarding allowlist;
   local links and a successful readiness command do not prove cloud access.
4. Check `.env.example` for required variable names and `src/lib/supabase.ts`
   for consumption. Report presence, target host, and validation outcomes only.
   Never print keys/tokens, dump environment files, pull cloud secrets, or fetch
   service-role keys for frontend setup. Existing local Vite uses production data.
5. Dependency installation, environment edits, link changes, and provider setting
   changes are separate mutations; require task authorization. Do not run
   `scripts/cloud-setup.sh` as a probe: it runs `npm ci`. Do not provision resources.
6. Report local readiness and live access separately, with unresolved prerequisites.
   Retain configured Git identity; never fabricate authorship/co-author trailers.

```powershell
cd D:\documents\claude-agent0toc
rtk proxy npm.cmd run toc:readiness
```

For permitted local development use the onboarding command; restart Vite after
an explicitly authorized environment change. Do not claim a frontend build is
isolated from production merely because it runs on localhost.
