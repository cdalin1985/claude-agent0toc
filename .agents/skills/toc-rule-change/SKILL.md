---
name: toc-rule-change
description: Implement an explicitly requested TOC league rule change using TOC canon, scoped code impact, and meaningful behavior regression tests.
---

# TOC rule change

Read [root instructions](../../../AGENTS.md) and [TOC onboarding](../../../docs/toc-onboarding.md).
Allow only `cdalin1985/claude-agent0toc`, Supabase `ankvjywsnydpkepdvuvm`
(`toc1`, organization `euguycqsxfnzrjisisiy`), and Vercel
`prj_cpSNmnjRXFK14Jadp2yU4tEghDFQ` in `team_JIGWMVABx7X7cCpDMuWcujgZ`.
Never inspect, derive, or copy rules/code/tests from another league. Stop on
mismatch or access denial; ask the user, never switch targets/accounts to bypass.

1. Verify cwd/remotes/branch/status/instructions and local readiness; independently
   verify cloud identity before any hosted read. Preserve existing edits and
   configured Git attribution. Work on a small local branch.
2. Translate the explicit request into before/after examples and boundary cases.
   Root canon governs unchanged rules. Read [README.md](../../../README.md) and
   [TOC_CANON_ALIGNMENT.md](../../../TOC_CANON_ALIGNMENT.md) critically: documentation
   can drift. Surface contradictory requirements and ask before choosing a new
   rule; do not quietly change wash/cooldown semantics during unrelated work.
3. Use scoped GitNexus query/context to locate server enforcement and consumers;
   run upstream impact before editing each symbol and report risk/callers/flows.
   Trace frontend eligibility, Edge Functions, SQL constraints/RPCs, and rule text.
   Keep one `apply_post_match_cooldowns` implementation; avoid a parallel rule engine.
4. Add regression tests that fail for the old behavior and execute the rule where
   practical. Cover rank #1, rank 10/11, first vs regular challenge, direction,
   time boundaries, loser/climber/defender, negotiation acceptance, and wash vs
   withdrawal only as affected. Preserve the minimum race of six and unified list
   unless the user explicitly changes them. Do not change fixtures to hide failures.
5. Existing `test/rules-and-time.test.mjs`, `test/negotiation.test.mjs`, and
   `test/wash-and-return-cooldowns.test.mjs` provide coverage leads; source-text
   matching alone does not prove behavior. Add SQL runtime assertions under
   `supabase/tests/migrations/` for affected database invariants and replay with
   `scripts/verify-db.sh` when migrations change, on disposable local Postgres only.
6. Update TOC rule text and tests together, run lint/build and affected checks,
   and detect_changes before any authorized commit. Local implementation does
   not authorize push, merge, migration, or release. Hand the concrete release
   and rollback plan to the release workflow; obtain explicit release approval.
