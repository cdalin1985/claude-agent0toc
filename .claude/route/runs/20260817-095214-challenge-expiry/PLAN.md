# Objective

Challenge expiry is advertised but never happens. `expire_stale_challenges()` exists and is
correct, but nothing runs it on a schedule — its only caller is `create-challenge`, the very
operation it exists to unblock. So a challenge stays `status='pending'` forever, the Challenges
screen shows "⚠️ Expiring soon" indefinitely once the countdown hits zero, and
`respond-to-challenge` will happily let the challenged player **accept or decline it weeks
later**, because it gates on `status` and never looks at `expires_at`.

This matters because the league runs on real money ($5 match fee) and the Rules screen tells
every member "A challenge expires if not answered within 2 days." At launch, 63 of 72 players
will be using the app for the first time.

When this is done: challenges expire on their own, a member can never act on an expired one,
and the UI says "Expired" instead of "Expiring soon".

**Expiry stays penalty-free.** This is a league ruling from the owner (2026-08-17), not an
oversight: an expired challenge costs the ignoring player nothing and does not consume one of
the challenger's weekly slots. Do not add a forfeit, a cooldown, or a stat change to expiry.

# Context

Read these before writing anything.

- **`supabase/migrations/20260507040125_008_expire_stale_challenges.sql`** — defines
  `public.expire_stale_challenges()`. It is already correct and idempotent: it updates
  `challenges` where `status='pending' AND expires_at <= NOW()` to `status='expired'` and returns
  the row count. **Do not modify this function.** The bug is purely that nothing calls it.

- **`supabase/migrations/20260807120000_enforce_match_window_and_reminders.sql`** — copy this
  cron idiom exactly (guarded by `pg_extension`, unschedule-then-schedule so it is re-runnable):
  ```sql
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'overdue-match-check') THEN
        PERFORM cron.unschedule('overdue-match-check');
      END IF;
      PERFORM cron.schedule(
        'overdue-match-check',
        '30 13 * * *',
        $cron$ SELECT public.expire_overdue_matches(); $cron$
      );
    END IF;
  END $$;
  ```
  The `pg_extension` guard matters: the CI replay job builds a plain Postgres 17 with no pg_cron,
  and the migration must still apply there.

- **`supabase/functions/respond-to-challenge/index.ts`** — action branches at lines 38
  (`propose`/`accept`), 180 (`accept_proposal`), 290 (`decline`), 324 (`reverse_decline`), 358
  (`wash`), 430 (`cancel`). The challenge row is fetched at line 27. `formatLeagueDateTime` is
  already imported at line 4 from `../_shared/leagueTime.ts` — use it for any timestamp shown to
  a member. Never render a raw UTC ISO string; that was fixed earlier and must not regress.

- **`supabase/functions/create-challenge/index.ts:164`** — the existing precedent for calling
  the sweeper from an edge function: `await supabase.rpc('expire_stale_challenges');`. Match it.

- **`supabase/functions/create-challenge/index.ts:112-116`** — `countsAgainstWeeklyLimit()`
  already encodes the penalty-free policy (`if (row.status === 'expired') return false`).
  **Do not change this function.**

- **`src/pages/ChallengesPage.tsx`** — `hours_left` is computed at line 40 as
  `Math.max(0, ...)`, so it floors at 0 and the caller cannot tell "expires within the hour"
  from "expired three days ago". Lines 521-532 render the countdown; the `hoursLeft === 0` branch
  currently prints "⚠️ Expiring soon", which is false for an already-expired challenge. Action
  buttons begin at line 536 (`tab === 'incoming' && c.status === 'pending'`).

- **`supabase/tests/migrations/08_production_alignment_assert.sql`** — the assert-file style to
  imitate: a `DO $$ ... $$` block collecting a `failures text[]`, raising with a joined message,
  fixed UUIDs plus `ON CONFLICT` so it is re-runnable. **These files run twice** in
  `migration-replay-check.yml` (once on the fresh build, once after re-applying migrations dated
  `>= 20260807`), so anything you write must survive a second execution.

- **`test/migration-drift.test.mjs`** — the behavioural test style: it executes the thing under
  test rather than grepping it. Prefer this over regex-over-source where you have the choice.

# Steps

1. **Create `supabase/migrations/20260817095214_expire_challenges_on_a_schedule.sql`.**
   Use the exact filename above. Schedule two jobs using the guarded idiom:
   - `challenge-expiry-check`, schedule `*/15 * * * *`, running
     `SELECT public.expire_stale_challenges();`. Fifteen minutes matches the existing
     `match-reminder-check` cadence and bounds the window in which an expired challenge is still
     actionable.
   - `inactive-demotion-check`, schedule `0 13 * * *`, running
     `SELECT public.process_inactive_demotions();`. This job **already exists in production** but
     no migration in this repo creates it — `20260813200000_align_repo_to_production.sql` restored
     the function and missed the schedule. Adding it here means a rebuilt database matches
     production. Unschedule-then-schedule makes re-applying it a no-op against production.

   Head the file with a comment explaining why the sweeper was unscheduled and what a member saw
   as a result.

2. **Guard `respond-to-challenge` against expired challenges.**
   - Immediately before the challenge is fetched (line 27), call
     `await supabase.rpc('expire_stale_challenges');` so the row read below already carries the
     correct status. This reuses existing, granted, idempotent machinery — do not write new SQL.
   - After the fetch and the existing null check, add a single guard: if
     `challenge.status === 'expired'` and `action !== 'cancel'`, return HTTP **409** with a
     member-facing message that names the expiry moment in league time, e.g.
     `` `This challenge expired on ${formatLeagueDateTime(challenge.expires_at)}. Nobody is penalised for an expired challenge — ask them for a fresh one.` ``
   - `cancel` stays allowed: the challenger tidying up their own dead challenge is harmless.
   - **`decline` must be blocked by this guard.** Declining applies a forfeit loss via
     `apply_challenge_decline_forfeit`. Letting someone decline an expired challenge would
     penalise them for something the rules say carries no penalty — the exact inversion of the
     owner's ruling.
   - Do not touch `reverse_decline`; it operates on already-declined challenges.

3. **Fix the Challenges screen.**
   - Give the query enough information to tell the two cases apart. Keep `hours_left` as-is for
     existing callers, and add a sibling boolean (suggested: `is_expired`, computed as
     `new Date(challenge.expires_at).getTime() <= now`) to the mapped row and to the
     `ChallengeWithHoursLeft` type.
   - Replace the `hoursLeft === 0` branch: when the challenge is past its expiry, render
     **"Expired"** (not "Expiring soon"), styled with the existing muted grey `text-[#6B7280]`
     rather than the red alarm colour — it is finished, not urgent.
   - Hide the Accept / Decline actions for an expired pending challenge, so the screen cannot
     offer an action the server will refuse.

4. **Add `supabase/tests/migrations/09_challenge_expiry_assert.sql`.** Behavioural, in the style
   of file 08:
   - Seed two players and a challenge whose `expires_at` is in the past and whose status is
     `pending`, using fixed UUIDs and `ON CONFLICT` so a second run is clean.
   - Call `public.expire_stale_challenges()` and require that challenge's status to become
     `expired`.
   - Seed a second challenge expiring in the future, and require the sweeper to **leave it
     alone** — without this the test would pass if the function expired everything.
   - Assert the cron jobs exist **only when pg_cron is installed** (`IF EXISTS (SELECT 1 FROM
     pg_extension WHERE extname = 'pg_cron')`), since CI's Postgres has no pg_cron. Skip with a
     `RAISE NOTICE` otherwise.
   - Finish with `RAISE NOTICE 'CHALLENGE EXPIRY: ALL CHECKS PASSED'`.
   - Note: `challenges` has a `different_players` CHECK (`challenger_id != challenged_id`) and
     partial unique indexes `idx_challenges_one_active_per_challenger` and
     `idx_challenges_one_active_per_challenged` over active statuses — use distinct players for
     each seeded challenge so the second seed does not collide with the first.

5. **Add tests to `test/`** following the conventions already in that directory. At minimum:
   the new migration schedules `challenge-expiry-check` and `inactive-demotion-check`; and
   `respond-to-challenge` calls the sweeper and refuses non-`cancel` actions on an expired
   challenge while `cancel` remains permitted.

# Constraints

- Do **not** modify `expire_stale_challenges()` itself, or `countsAgainstWeeklyLimit()`.
- Do **not** add any penalty, cooldown, stat change, or ranking change on expiry.
- Do **not** change what a genuine (non-expired) decline does — that remains a forfeit loss.
- Do **not** touch `.github/known-production-only-migrations.txt`,
  `.github/scripts/compare-migrations.sh`, or any file under `.github/workflows/`.
- Do **not** edit any existing migration file. Migration history is append-only here.
- Do **not** add dependencies. No new npm or Deno packages.
- The new migration must be **idempotent** — CI re-applies everything dated `>= 20260807` a
  second time and then re-runs every assert.
- Do not widen scope. Other known issues (the latent `rankings.position` shift inside
  `process_inactive_demotions`, the dead `get_ranked_players`) are explicitly out of scope.

# Acceptance criteria

- [ ] `supabase/migrations/20260817095214_expire_challenges_on_a_schedule.sql` exists and
      schedules both `challenge-expiry-check` (`*/15 * * * *`) and `inactive-demotion-check`
      (`0 13 * * *`).
- [ ] The migration applies cleanly on a Postgres with **no** pg_cron extension, and applying it
      twice in a row succeeds.
- [ ] `respond-to-challenge` calls `expire_stale_challenges` before reading the challenge row.
- [ ] `respond-to-challenge` returns 409 for `accept`, `decline`, `propose`, `accept_proposal`
      and `wash` on an expired challenge, with a message containing no raw ISO timestamp.
- [ ] `respond-to-challenge` still permits `cancel` on an expired challenge.
- [ ] `ChallengesPage` renders "Expired" for a past-expiry pending challenge and no longer
      renders "Expiring soon" for it.
- [ ] `ChallengesPage` does not render Accept or Decline for an expired pending challenge.
- [ ] `supabase/tests/migrations/09_challenge_expiry_assert.sql` exists, expires a past-due
      challenge, leaves a future-dated one untouched, and is safe to run twice.
- [ ] `countsAgainstWeeklyLimit` and `expire_stale_challenges()` are byte-for-byte unchanged.
- [ ] `npx tsc -b` reports no errors.
- [ ] `node --test test/*.test.mjs` passes with no failures, and the total test count is higher
      than the 207 on `main` today.

# Verification

Run each of these and paste the real output.

```bash
node --test test/*.test.mjs 2>&1 | tail -8
```
Expect `fail 0` and `pass` greater than 207.

```bash
npx tsc -b 2>&1 | tail -5
```
Expect no output (success).

```bash
npx eslint . 2>&1 | tail -5
```
Expect no errors.

```bash
git diff --stat
```
Expect only: the new migration, the new assert file, `respond-to-challenge/index.ts`,
`src/pages/ChallengesPage.tsx`, and test files. Anything else is scope creep.

You cannot run Postgres locally (no Docker in this environment), so do not attempt to execute the
migration or the assert file. CI runs both on a fresh Postgres 17. Write them carefully and say
plainly in your report that they are unexecuted.

# Output contract

Report back:

- Every file changed and why.
- Every command you ran and its **real** output — not what you expect it to print.
- Each acceptance criterion, marked pass or fail, with the evidence you used.
- Anything in this plan you could not do, and the reason.
- Anything you changed that this plan did not ask for, called out explicitly.
