---
name: toc-incident-diagnostics
description: Investigate a TOC application incident with read-only, repository-scoped code and provider evidence before proposing a fix.
---

# TOC incident diagnostics

Read [root instructions](../../../AGENTS.md) and [TOC onboarding](../../../docs/toc-onboarding.md).
Allow only `cdalin1985/claude-agent0toc`, Supabase `ankvjywsnydpkepdvuvm`
(`toc1`, organization `euguycqsxfnzrjisisiy`), and Vercel
`prj_cpSNmnjRXFK14Jadp2yU4tEghDFQ` in `team_JIGWMVABx7X7cCpDMuWcujgZ`.
No other league's files, history, or resources. Stop on target mismatch or access
denial; ask the user, never switch account/project/tool credentials to bypass it.

1. Verify cwd/remotes/branch/status and run `toc:readiness` using the onboarding
   snippet. Preserve existing edits. Confirm live metadata for the exact targets.
2. Capture the symptom, timestamp/timezone, URL, user role, device, and expected
   behavior. Retrieve the actual error/request response before assuming a cause.
3. Scope logs to that project, function/deployment, and a short incident window.
   Minimize personal data and redact credentials. Prefer metadata and logs over
   table rows. SQL must be an inspected bounded SELECT in a read-only transaction;
   do not call RPCs or volatile functions merely because they use SELECT/GET.
4. Use GitNexus query/context for execution flows in this repository only. Before
   symbol edits run upstream impact and report callers, processes, and risk.
   Report missing/stale index limitations; do not silently claim zero impact.
5. For push incidents distinguish Safari from installed Home Screen PWA. Compare
   service-worker controller, loaded Settings chunk, and redacted subscription
   details against `src/hooks/usePushNotifications.ts` and `public/sw.js`.
   Request an existing send-test-push response/log; sending a new notification,
   resubscribing, or changing VAPID secrets is not a read-only diagnostic.
6. State observed facts, hypotheses, and the smallest next discriminating check.
   Do not rotate credentials, clear app storage, redeploy, mutate production, or
   send messages as a diagnostic shortcut. Pause code changes during user device
   testing. Route any approved fix/release through its own scoped workflow.

Preserve configured Git identity and truthful authorship. A successful build or
HTTP 200 alone does not prove the incident is fixed; verify the reported behavior
after an explicitly approved release and identify any test coverage still absent.
