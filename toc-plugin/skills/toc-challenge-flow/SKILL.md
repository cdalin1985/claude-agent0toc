---
name: toc-challenge-flow
description: Use when working on challenges - eligibility checks, lifecycle states, response flow, edge function logic
---

# TOC Challenge Flow

## Overview

Challenges are the core mechanic. A challenge moves through states with strict eligibility rules at each transition. The source of truth is the `create-challenge` edge function — UI should mirror it, never override it.

**Core principle:** Eligibility is enforced server-side. UI is a hint, not a gate.

## Challenge Lifecycle

```
pending → accepted → scheduled → confirmed → resolved
        ↘ declined            ↘ disputed → resolved
        ↘ expired
```

| Status | Meaning |
|--------|---------|
| `pending` | Issued, awaiting response |
| `accepted` | Challenged player accepted, needs scheduling |
| `scheduled` | Venue + time chosen, awaiting confirmation |
| `confirmed` | Both parties locked in |
| `resolved` | Match completed, result submitted |
| `disputed` | Result contested, admin intervention |
| `expired` | Response window passed |

## Eligibility — `canChallenge` Logic

Implemented in `supabase/functions/create-challenge/`. Rules in priority order:

```
1. Challenger ≠ Challenged                        (no self-challenge)
2. Challenger not in active cooldown              (24h post-loss)
3. Position rules:
   a. Challenger.rank == 1                        → can challenge anyone
   b. Challenger.position ≤ 10 (top 10)           → challenged.position within ±5
   c. Challenger is new (first challenge)         → up to 10 spots above
   d. Otherwise (regular non-top-10)              → up to 5 spots above only
4. No existing pending/accepted challenge between same pair
```

"First challenge" = challenger has zero prior `challenges.challenger_id` rows.

## Key Files

| File | Role |
|------|------|
| `supabase/functions/create-challenge/index.ts` | Server-side eligibility + insert |
| `supabase/functions/respond-to-challenge/index.ts` | accept/decline, sets cooldown on decline |
| `supabase/functions/submit-result/index.ts` | Match completion, ranking update, post-loss cooldown |
| `src/pages/RankingsPage.tsx` | `canChallenge()` UI check on `RankCard` |
| `src/pages/ChallengesPage.tsx` | Tabs: incoming / outgoing / history, `RespondModal` |
| `src/pages/MatchPage.tsx` | Score submission, dispute trigger |

## UI Mirror Pattern

`RankingsPage` shows or hides the "Challenge" button using a client-side `canChallenge()`. **This is duplicate logic for UX only** — the edge function re-validates.

When changing eligibility rules:
1. Update edge function `create-challenge` first (canonical)
2. Mirror the change in client `canChallenge()` helper
3. Add a regression test for both
4. Never trust the client check alone

## Response Flow

In `RespondModal`:
- **Decline** → status: `declined`, triggers `post-decline` cooldown on challenger
- **Accept** → status: `accepted`, opens scheduling
- **Schedule** → choose venue (from `league_settings.venues`) and time → status: `scheduled`
- **Confirm** → both players ack → status: `confirmed`

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Hardcoded ±5 in two places | Source from `league_settings.challenge_range` |
| Missing cooldown check | Always query `cooldowns` before allowing challenge |
| Allowing self-challenge | First validation in `canChallenge` |
| Ignoring "first challenge" rule | Count `challenges` where `challenger_id = X` |
| Treating top-10 as one-way | Top 10 can challenge ±5 (both up and down) |

## Verification

After changes to challenge logic:
- [ ] Edge function regression tested with curl/Postman
- [ ] Client `canChallenge()` returns same result as server
- [ ] Cooldowns respected for both challenger and challenged
- [ ] Self-challenge blocked
- [ ] Rank #1 still has unlimited reach
- [ ] First-challenge rule fires only for true zero-history players
