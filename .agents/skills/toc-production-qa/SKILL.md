---
name: toc-production-qa
description: Plan and execute explicitly authorized TOC guest, member, admin, and mobile QA with approval before production data changes.
---

# TOC production QA

Read [root instructions](../../../AGENTS.md) and [TOC onboarding](../../../docs/toc-onboarding.md).
Allow only `cdalin1985/claude-agent0toc`, Supabase `ankvjywsnydpkepdvuvm`
(`toc1`, organization `euguycqsxfnzrjisisiy`), Vercel
`prj_cpSNmnjRXFK14Jadp2yU4tEghDFQ` in `team_JIGWMVABx7X7cCpDMuWcujgZ`,
and production `https://toc.monster`. Stop on mismatch/denial; ask for access or
identifiers. Do not inspect another league or switch targets/accounts to bypass.

1. Verify repository/status/instructions and readiness; independently confirm
   exact cloud metadata. Localhost currently uses production TOC data. No isolated
   QA backend has been approved; never infer one from a preview URL.
2. Plan before execution. Reuse [TESTING.md](../../../TESTING.md) and the
   [admin rehearsal](../../../docs/release/admin-rehearsal-script.md) as coverage
   inventories only. They contain stale scheduling/season/migration assumptions;
   reconcile with current root instructions and code. Never reuse listed real
   accounts or pretend old migration filenames prove current readiness.
3. Separate read-only guest/navigation checks from data-changing scenes. Include
   member visibility, admin boundaries, and super_admin-only treasury management.
   Verify denied access exposes no forbidden rows, not just a status code.
4. BEFORE any production mutation, obtain approval for the concrete scene,
   designated test identities, affected ranks/ledger, notifications/recipients,
   expected side effects, and cleanup/reversal plan. Login/claim, profile edits,
   challenges, scoring, push subscriptions/tests, admin actions, and treasury
   writes can change hosted state. Testing denied writes also needs approval.
5. Use approved disposable identities, not real standings, whenever authorized.
   Provide a cast/scene sheet for paired tests, or a separate phone checklist for
   remote testers. Cover iOS Safari vs Home Screen PWA, Android browser vs installed
   app, network transitions, notification permission/Focus, refresh and stale UI.
6. Record pass/fail/blocked with role, device, time, and sanitized evidence.
   Stop on unexpected production effects. Cleanup is itself a mutation: perform
   only approved, supported reversals and reconcile ranks, stats, and treasury;
   never directly delete ledger rows or mass-delete test records to hide effects.

No deployment or resource provisioning is implied by QA. Keep credentials out
of reports and preserve truthful Git attribution for any resulting fixes.
