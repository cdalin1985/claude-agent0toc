---
name: toc-ranking-system
description: Use when working on the unified ranking system - position updates, top-10 rules, rank #1 tracking, discipline merging
---

# TOC Ranking System

## Overview

One ladder, three disciplines (8/9/10 ball), unified position. The ranking is the visible scoreboard for the entire league.

**Core principle:** Position changes only on match resolution. No backdoor updates.

## Data Model

### `rankings` table
- `player_id` (FK to players)
- `position` (integer, 1 = top)
- `rank1_since` (timestamp — when this player first hit #1, null if not #1)

### Supporting Stats
- `player_discipline_stats` — per-discipline wins/losses (informs unified rank)
- `player_season_stats` — overall wins/losses/streaks
- `player_reference_metrics` — Fargo rating (external reference, not the rank)

## Unified Ranking Logic

Position is a single integer across all disciplines. Don't create per-discipline ladders.

Position changes when:
1. A match resolves (`matches.status = resolved`, `winner_id` set)
2. Winner moves up if challenger won AND was below challenged
3. Loser drops to winner's old position
4. Intermediate players shift by 1

This swap-style update preserves the ladder's integrity (no gaps, no duplicate positions).

## Rank #1 Tracking

- `rankings.rank1_since` records when a player first reached position 1
- Used for "longest #1 reign" stats
- When position changes from 1 → not 1, **do not** clear `rank1_since` (history)
- When position becomes 1 again, **only set** `rank1_since` if it was previously null OR overwrite (decide per requirement — check canon)

## Key Files

| File | Role |
|------|------|
| `src/hooks/useRankings.ts` | Fetch ranked player list (joins rankings + players + metrics) |
| `src/pages/RankingsPage.tsx` | Display list, `RankCard` per player |
| `supabase/functions/submit-result/index.ts` | Position update on match resolution |
| `src/types/database.ts` | `Ranking`, `RankedPlayer` (composite type) types |

## RankedPlayer Composite

`useRankings` returns `RankedPlayer[]` — a join of:
- `players` (full_name, bio, discipline)
- `rankings` (position, rank1_since)
- `player_reference_metrics` (fargo)
- `player_season_stats` (W/L/streak)

Don't fetch these separately and join client-side. Use the existing hook.

## Position Update Algorithm (Match Resolution)

```
Given: challenger_id = C, challenged_id = D, winner_id = W
       posC = rank.position of C
       posD = rank.position of D
       (assume challenger always issues to someone ≥ position, so posC > posD)

If W == C (challenger won, upset):
  - Swap: C moves to posD, D moves to posD + 1
  - All players between posD and posC shift down by 1
Else (challenged defended):
  - No change. Positions stay.
```

Edge case: if `W == C` but `posC < posD`, that's a top-10 downward challenge — different logic. Verify rules in `submit-result`.

## Don'ts

🚫 Don't update `rankings.position` outside of `submit-result` (no admin shuffling without audit)
🚫 Don't show separate 8-ball / 9-ball / 10-ball ladders — it's unified
🚫 Don't fetch rank data piecemeal in components — use `useRankings`
🚫 Don't clear `rank1_since` when position changes away from 1 (historic value)

## Verification

After ranking changes:
- [ ] No duplicate positions in `rankings`
- [ ] No gaps in position sequence (1, 2, 3, ... N)
- [ ] `rank1_since` set/preserved correctly
- [ ] Discipline stats still update independently
- [ ] UI reflects new positions immediately (real-time subscription)
