---
name: toc-admin-and-treasury
description: Use when touching admin features, role-gated UI, treasury ledger, audit events, or dispute resolution
---

# TOC Admin & Treasury

## Overview

The admin surface is privileged. Treasury is the most sensitive part — super_admin only. Every admin action must be auditable.

**Core principle:** No silent admin actions. Every write to privileged data leaves a trace.

## Role Hierarchy

```
super_admin  ← full access, treasury writes, league_settings
  admin      ← disputes, players, challenges, matches, rankings overrides
  player     ← default, can challenge, submit results, view treasury
```

Roles live in `profiles.role` (enum).

## Role Checks

### Client-Side (UX gate, not security)

In `src/pages/AdminPage.tsx`:
```ts
if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
  return <NotAuthorized />;
}
```

For treasury writes specifically:
```ts
if (profile.role !== 'super_admin') {
  // Hide / disable the write controls
}
```

### Server-Side (the real gate)

RLS policies on `treasury_ledger`, `league_settings`, `audit_events` — restrict mutations to the matching role. Edge functions re-verify role via `profiles` lookup, not just JWT claim.

**Never rely on client-side role check alone.**

## Admin Panel Structure

`src/pages/AdminPage.tsx` tabs:

| Tab | Purpose | Role |
|-----|---------|------|
| disputes | Resolve `matches.status = disputed` | admin+ |
| challenges | Override/cancel challenges | admin+ |
| matches | Edit/correct match records | admin+ |
| rankings | Manual rank adjustment (rare) | admin+ |
| players | Player profiles, suspensions | admin+ |
| treasury | Ledger view + entry | super_admin write, admin read |
| rank1 | Rank #1 history / overrides | admin+ |
| settings | `league_settings` editor | super_admin |
| audit | View `audit_events` log | admin+ |

## Treasury Rules

### Read (everyone)
- `TreasuryPage.tsx` shows ledger + balance to all players
- RLS allows SELECT for `authenticated`

### Write (super_admin only)
- Insert via edge function `manage-treasury`
- Entry types: `credit`, `debit`, `correction`
- Amounts in **integer cents** (never floats)
- Every entry includes a `reason` string

### Balance Calculation
- Balance = SUM of all `amount_cents` where positive credit, negative debit
- Don't cache a balance column — always derive from ledger (audit trail integrity)
- For display, format with `formatCurrency` helper (cents → dollars string)

## Audit Events

`audit_events` table records sensitive actions. Schema:
- `actor_id` (who did it)
- `action` (string identifier, e.g. `treasury.credit`, `match.dispute_resolved`)
- `target_type` + `target_id` (what was affected)
- `detail` (JSON blob with context)
- `created_at`

### When to Write an Audit Event

✅ Admin overriding a match result
✅ Treasury ledger entry
✅ Manual ranking adjustment
✅ Player suspension or role change
✅ Dispute resolution
✅ `league_settings` change

❌ Routine player challenges (high volume, low risk)
❌ Match result submissions by participants (already in `matches`)

## Dispute Resolution Flow

1. Player submits result via `submit-result`
2. Other party disputes → `matches.status = disputed`
3. Appears in admin disputes tab
4. Admin reviews evidence (chat logs, witnesses — handled outside system)
5. Admin sets final result → triggers ranking update + audit event
6. Status → `resolved`

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Storing money as float | Always integer cents |
| Caching a balance | Always compute from ledger |
| Skipping audit on admin override | Every admin write → audit event |
| Letting admin write treasury | Only super_admin |
| Client-only role check | Server must re-verify |
| Audit detail with sensitive PII | Keep audit detail minimal + structured |

## Verification

For admin / treasury changes:
- [ ] Role check on client AND server
- [ ] Treasury writes restricted to super_admin
- [ ] Audit event written for every privileged action
- [ ] Amounts are integer cents
- [ ] Balance derived, not cached
- [ ] Tested with all three role levels
