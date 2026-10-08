---
name: toc-release
description: Prepare a TOC release, separate frontend/database/function steps, and verify live behavior only after explicit release approval.
---

# TOC release

Read [root instructions](../../../AGENTS.md) and [TOC onboarding](../../../docs/toc-onboarding.md),
including its approval and rollback sections. Allow only
`cdalin1985/claude-agent0toc`, Supabase `ankvjywsnydpkepdvuvm` (`toc1`,
organization `euguycqsxfnzrjisisiy`), and Vercel
`prj_cpSNmnjRXFK14Jadp2yU4tEghDFQ` in `team_JIGWMVABx7X7cCpDMuWcujgZ`.
Production is `main` / `https://toc.monster`. Never use another league's resources.
Stop on mismatch/access denial; ask, do not switch account/project or credentials.

1. Verify cwd/remotes/branch/status/root instructions and readiness, then exact
   cloud identities. Preserve existing edits and select only intended files.
   Do not change Git author/committer identity or invent co-author attribution.
2. Review the diff and GitNexus upstream impact before symbol edits. Run
   detect_changes before committing; disclose unindexed coverage. Run lint,
   typecheck/build, and meaningful affected tests using onboarding safeguards.
   Migration changes also require `scripts/verify-db.sh`: it replays the complete
   history on throwaway local Postgres 17 and runs assertions. Missing Docker/psql
   is a blocked prerequisite, not permission to test against hosted production.
3. Prepare a reviewable release manifest: exact SHA, affected frontend assets,
   ordered database migrations, Edge Function names/JWT settings, expected user
   behavior, dependencies, tests, and rollback targets. Report each lane separately.
4. Inspect `.github/workflows/migration-apply.yml`,
   `.github/workflows/deploy-edge-functions.yml`, and `vercel.json` anew. Pushing
   may create a preview; merging main triggers production automation. A draft PR
   or previous general merge preference does not override a no-release constraint.
5. Obtain explicit approval for the concrete release and its side effects BEFORE
   push/merge/dispatch/deploy that releases it. Once approved, follow the verified
   pipeline; coordinate additive DB/function compatibility before frontend use.
   Do not silently deploy unrelated functions: the existing workflow deploys all
   listed functions, so its full scope must be in the approval.
6. Verify migration application/runtime behavior, function behavior, and Vercel
   deployment SHA/domain independently. A merge, green CI, READY deployment, or
   skipped Supabase Preview alone is not live feature verification. Test actual
   acceptance behavior on the approved surface; obtain separate approval for
   data-changing QA not already included in the release approval.
7. On failure stop further rollout and use the approved rollback plan. Frontend
   rollback does not roll back functions or data. Never use destructive schema
   rollback, blind migration replay, or database restore without explicit scope.
