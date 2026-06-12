# TOC Admin Testing Guide

Before launching to all league members, admins should verify all features and
canon rules behave correctly. This guide reflects the current production
workflow (server-side guardrails, dual-submission result confirmation, and the
single-scoreboard match flow).

## Test Environment

- **Preview URL**: the Vercel preview attached to the PR, or https://toc.monster for production
- **Test accounts**: create 3–5 test players at different rankings
- **Cleanup**: delete test challenges/matches/players before launch

---

## Account & Authentication

- [ ] **Magic-link login** works and establishes a session
- [ ] **Player claim** lets a user select/claim a profile
- [ ] **Admin invite flow** works for new and unclaimed players
- [ ] **Inactive player banner** shows for players marked inactive
- [ ] **Sign out** clears the session and redirects to login

---

## Rankings & Home

- [ ] **Unified ranking list** shows all players (8-/9-/10-Ball combined)
- [ ] **Pool-ball icons** show correct position (1–10 colored, 11+ blank)
- [ ] **Player stats** show wins, losses, current/best streak
- [ ] **Challenge button** appears only for players you may challenge
- [ ] **Home** shows pending outgoing/incoming challenges and active matches with correct counts

---

## Challenge Rules (Canon Enforcement)

These are enforced server-side in `create-challenge`.

- [ ] **First challenge ever:** up to **10 spots above** allowed; beyond shows an error
- [ ] **Regular (non-top-10):** only **up to 5 spots above**; down/farther is rejected
- [ ] **Top 10:** **±5 spots** allowed
- [ ] **Rank #1:** may challenge **anyone**
- [ ] **Minimum race = 6:** race < 6 rejected with a clear error
- [ ] **Weekly limit:** max **2 challenges per rolling 7 days**
- [ ] **One active outgoing challenge** at a time
- [ ] **Post-loss cooldown (24h):** challenging up during cooldown is blocked with the unlock time

### Rank #1 Compliance
- [ ] Must play **≥2 top-5 opponents within 30 days** or drop to #10
- [ ] Cron enforces daily; admin can **Enforce Now** from the Rank 1 tab
- [ ] Penalty moves player to #10, emits `rank1_penalty`, sends a notification

---

## Challenge Workflow

### Create
- [ ] Challenge page shows target rank/stats
- [ ] Discipline (8/9/10-Ball) and race length required; validation works
- [ ] Send creates the challenge and notifies the challenged player

### Respond
- [ ] **Accept** requires venue (Eagles 4040 / Valley Hub) + date + time
- [ ] Accepting creates a **scheduled** match with the challenger recorded as scorekeeper
- [ ] **Decline** is recorded as a **forfeit** (challenger wins, decliner takes the loss + cooldown) via `apply_challenge_decline_forfeit`
- [ ] Admin can **reverse a decline** (only before rankings/stats have otherwise changed)
- [ ] **Wash / "Couldn't agree"** cancels with no penalties (either player)
- [ ] **Cancel** removes an outgoing pending challenge
- [ ] Cancel and "Couldn't agree" buttons show a **loading spinner** while the action runs

---

## Match Workflow (Single Scoreboard)

### Start & Score
- [ ] **Only the initiator** (the challenger) sees **Start Match** and the score (+) controls
- [ ] The non-initiator sees **"<Name> is keeping the score for this match."**
- [ ] First score update transitions the match to **in_progress** and emits a **`match_started`** journal event
- [ ] Scores cannot exceed race length; a tie (both at race length) is rejected
- [ ] Server rejects score updates from the non-initiator (single-scoreboard guardrail)

> Note: older matches created before this release have no recorded initiator and
> stay open to either participant — verify a freshly created match enforces the
> single scoreboard.

### Submit & Confirm (dual submission)
- [ ] Each player submits their result (winner + final score)
- [ ] When **both submissions match**, the match auto-confirms to **confirmed**
- [ ] When submissions **don't match**, the match flips to **disputed** and both players are notified (`result_disputed`)
- [ ] Final-score validation rejects impossible scores (winner must reach race length, only one player at race length)
- [ ] Attaching a payment method records the **$5 match fee** to the treasury (see Treasury)

### Confirmed result effects
- [ ] `match_confirmed` journal event posted
- [ ] When the winner was ranked **below** the loser, rankings cascade (winner takes the spot)
- [ ] **`rank_change`** journal events posted for each player whose position moved (shows old → new)
- [ ] Loser receives a 24h post-loss cooldown
- [ ] Season + discipline stats update (wins, losses, streaks, challenger/defender wins)

---

## Disputes (Admin)

- [ ] Disputed matches appear in **Admin → Disputes** with both players' submitted scores
- [ ] Resolve form: select winner, enter final score, optional admin notes
- [ ] Resolving updates the match, cascades rankings, and notifies both players
- [ ] Match fees still recorded for any attached payment methods

---

## Admin Controls

- [ ] **Challenges tab:** Force Cancel (no match) and Force Forfeit (with winner selection) work; buttons show loading state
- [ ] **Matches tab:** lists scheduled/in_progress/submitted matches
- [ ] **Rankings tab:** reflects post-match changes
- [ ] **Rank 1 tab:** shows status (compliant / overdue / inside window); Enforce Now applies penalty
- [ ] **Treasury tab:** only **super_admin** can add entries; all players can view; ledger is append-only
- [ ] **Audit tab:** records admin actions

---

## League Journal (Activity Feed)

Verify these event types render with sensible headlines:

- [ ] `challenge_issued`
- [ ] `challenge_accepted`
- [ ] `match_started` *(new — single-scoreboard go-live)*
- [ ] `match_confirmed`
- [ ] `match_disputed`
- [ ] `rank_change` *(new — shows old → new position)*
- [ ] `match_fee_recorded`
- [ ] `rank1_penalty`

---

## Notifications

- [ ] Challenge received / accepted / declined-as-forfeit / reversed
- [ ] Opponent submitted result → prompt to submit yours
- [ ] Result confirmed (winner + loser)
- [ ] Result disputed (both players)
- [ ] Rank #1 penalty
- [ ] Push notifications deliver (if subscribed)

---

## UI / UX & Reliability

- [ ] Loading states on async buttons (submit, cancel, wash, resolve, force actions)
- [ ] Error messages are user-friendly
- [ ] Inline validation (race length, required venue/date/time)
- [ ] Empty states for no challenges/matches/history
- [ ] Responsive on mobile/tablet/desktop
- [ ] Match page refetches live during play; rankings reflect changes within ~10s
- [ ] No console errors in DevTools

---

## Production Readiness Checklist

- [ ] All canon rules verified
- [ ] `initiated_by_player_id` migration applied to production Supabase
- [ ] Single-scoreboard verified on a freshly created match
- [ ] Multiple admins exercised admin controls
- [ ] Test data cleaned up
- [ ] Email + push notifications delivering
- [ ] Vercel build green
- [ ] Database backups configured

---

## Troubleshooting

**Score won't update** — confirm you are the match initiator (challenger) and the match is `in_progress`; score must not exceed race length.

**Challenge creation fails** — check active status, weekly limit (2/7d), existing active outgoing challenge, and post-loss cooldown.

**Rankings not updating** — confirm the match is `confirmed` and the winner was ranked below the loser (cascade is one-directional); allow ~10s for refresh.

**Decline looks wrong** — a decline is a forfeit; ask an admin to reverse it if it was an accident and rankings/stats haven't otherwise changed.

---

_For questions, contact the dev team._
