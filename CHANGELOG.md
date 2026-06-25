# Changelog

All notable changes to TOC.Monster are documented here. Dates are UTC.
This project does not yet tag semver releases; entries are grouped by ship date.

## 2026-06-25

### Security
- **Closed RLS self-escalation gaps** (`20260625000000_fix_self_escalation_rls.sql`).
  The `profiles` and `players` UPDATE policies previously checked only row
  ownership, letting any authenticated user promote their own `role` or
  reactivate their own `players.is_active`. Both policies now pin those columns
  to their existing values in the `WITH CHECK` clause.
- **`send-push` now rejects unauthenticated callers** — it validates the bearer
  token via `auth.getUser` and returns `401` when absent.

### Fixed
- **Removed an unintended race-length cap.** A hardcoded `race_length <= 15`
  database constraint contradicted the canon (minimum 6, no maximum, with
  `league_settings.max_race` intentionally `NULL`). A Race-to-16+ challenge
  passed application validation but failed at insert with a 500. The constraint
  is now `CHECK (race_length >= 6)`
  (`20260625020000_remove_race_length_max_cap.sql`).

### Performance
- **Batched and parallelized edge-function queries.** `create-challenge` and
  `submit-result` now run independent stat reads/updates concurrently with
  `Promise.all`, and the match-fee duplicate check is a single batched query
  with a `Set` membership test instead of one query per payer.
- **Eliminated O(N²) render-time lookups.** `MatchesPage` and `ChallengesPage`
  now resolve opponent names from a memoized `Map` instead of scanning the full
  rankings array on every row.
- **Added compound indexes** matching the real query predicates
  (`20260625010000_add_performance_indexes.sql`): `matches(player1_id, status)`,
  `matches(player2_id, status)`, and `challenges(challenger_id, created_at)`.

### Tests
- Added `test/security-and-performance.test.mjs` — static regression guards that
  lock in the invariants above so they can't silently regress. Full suite is
  33/33 passing under `npm test`.
