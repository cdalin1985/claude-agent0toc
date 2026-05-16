---
name: toc-canon
description: Use whenever working on TOC business logic - the immutable rules of the league
---

# TOC Canon — Authoritative Rules

## Overview

These are the league rules. They are NOT preferences or defaults — they are canon. Any code that violates them is a bug, regardless of how clean it looks.

**Core principle:** If the code disagrees with canon, canon wins.

## The Canon

### Race Format
- **Minimum race = 6** — no match is shorter than race-to-6
- Configurable via `league_settings.disciplines` (per-discipline race targets) but never below 6

### Challenge Eligibility
- **New member, first challenge:** up to **10 spots** above
- **Regular (non-top-10) player:** up to **5 spots** above only
- **Top 10 player:** can challenge ±5 spots (up or down)
- **Rank #1 player:** can challenge **anyone** on the ladder
- A player cannot challenge themselves

### Cooldowns
- **Post-loss cooldown = 24 hours** — losers cannot issue or accept challenges for 24h
- Stored in `cooldowns` table with `expires_at` timestamp
- Other cooldown types (post-decline) may exist; check `league_settings.cooldown_hours`

### Ranking System
- **One unified ranking list** across 8 Ball, 9 Ball, 10 Ball
- Per-discipline stats (`player_discipline_stats`) inform the unified position
- Position is a single integer in `rankings.position`

### Venues
- **Eagles 4040** and **Valley Hub** — these are the only canonical venues
- Stored in `league_settings.venues`
- Venue selection happens in the challenge response flow

### Treasury
- **Visible to all players** (SELECT allowed for everyone via RLS)
- **Only `super_admin` manages treasury** (INSERT/UPDATE restricted)
- Entry types: `credit`, `debit`, `correction`
- All amounts in cents (integer), never floats

## Where Canon Lives in Code

| Rule | Source of Truth |
|------|-----------------|
| Race targets | `league_settings.disciplines` (DB) |
| Challenge range | `league_settings.challenge_range` (DB) + edge fn `canChallenge` |
| Cooldown hours | `league_settings.cooldown_hours` (DB) + `cooldowns` table |
| Venues | `league_settings.venues` (DB) |
| Roles | `profiles.role` enum: `player | admin | super_admin` |
| Rank #1 special | `rankings.rank1_since` timestamp |

## When Canon Conflicts with Settings

`league_settings` is mutable by admin. If a setting in the DB conflicts with documented canon, **stop and ask** — don't silently follow the setting. Possible cases:
- Admin intentionally adjusted a rule (then canon doc needs update)
- Bad data / migration error (then DB needs fix)
- Misunderstanding (then check with Chase)

## Red Flags

🚩 Hardcoding race numbers other than 6+
🚩 Allowing a non-top-10 player to challenge >5 spots
🚩 Letting a loser challenge before 24h passes
🚩 Treasury writes from non-`super_admin` accounts
🚩 Floats for money amounts
🚩 Per-discipline ranking lists (it's unified)
🚩 Venue strings not in the canonical list

## Verification

Before committing logic that touches any of the above:
- [ ] Read the relevant rule above
- [ ] Confirm code matches canon (not just "looks right")
- [ ] Check `league_settings` row hasn't been mutated to break canon
- [ ] If touching DB rules, update this skill if canon changed
