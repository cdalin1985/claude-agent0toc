---
name: toc-supabase-patterns
description: Use when writing Supabase code for TOC - RLS policies, edge functions, real-time subscriptions, migrations
---

# TOC Supabase Patterns

## Overview

TOC uses Supabase for auth, database (Postgres), edge functions (Deno), and real-time. Follow the existing patterns — don't invent new ones for one-off needs.

**Core principle:** Server-side validation via RLS + edge functions. Client trust = zero.

## Client Initialization

Single source: `src/lib/supabase.ts`. Import the client from there. Never create new `createClient()` calls in components or pages.

```ts
import { supabase } from '@/lib/supabase';
```

## RLS Policy Patterns

Migrations live in `supabase/migrations/`. The auth model is in `003_rls.sql`.

### Standard Policies

| Table | SELECT | INSERT/UPDATE/DELETE |
|-------|--------|---------------------|
| `profiles` | everyone | own row only |
| `players` | everyone | admin / super_admin |
| `rankings` | everyone | edge functions only (service role) |
| `challenges` | everyone | own challenger row, admin override |
| `matches` | everyone | participants on result submit, admin override |
| `treasury_ledger` | everyone (read-only) | super_admin only |
| `audit_events` | admin / super_admin | edge functions only |
| `league_settings` | everyone | super_admin only |

### Writing a New Policy

1. Add to a new migration in `supabase/migrations/NNN_*.sql`
2. Use `auth.uid()` for ownership checks
3. Use `current_user_role()` helper if it exists, or join `profiles` for role
4. Test with three accounts: player, admin, super_admin
5. Document the policy intent in the migration comment

## Edge Function Patterns

Functions live in `supabase/functions/<name>/index.ts`. Used for:
- Multi-table writes that need transaction-like safety
- Logic that can't be expressed in RLS alone
- External API calls (push notifications, etc.)

### Function Skeleton

```ts
import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';

serve(async (req) => {
  // 1. Auth: verify JWT, get user
  // 2. Validate input
  // 3. Load relevant DB state
  // 4. Apply business rules (canon!)
  // 5. Perform mutation(s)
  // 6. Return JSON response
});
```

### Existing Functions

| Function | Purpose |
|----------|---------|
| `create-challenge` | Eligibility check + insert |
| `respond-to-challenge` | Accept/decline + cooldown set |
| `submit-result` | Match resolution + rank update + cooldown |
| `manage-treasury` | super_admin-gated ledger writes |

When adding a new function, copy the auth/validation header from an existing one.

## Real-Time Subscriptions

Used for live ranking updates and notifications. Pattern in `useRankings` and notification hooks:

```ts
const channel = supabase
  .channel('rankings-live')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'rankings' },
    (payload) => { /* refetch or merge */ }
  )
  .subscribe();

return () => { supabase.removeChannel(channel); };
```

Clean up subscriptions in the hook's cleanup function. Don't leave channels open across mounts.

## Migrations

- One concern per migration
- Filename: `NNN_descriptive_name.sql` (zero-padded sequence)
- Include `-- up` and (where reasonable) reversibility notes
- Test against a branched Supabase project before applying to prod
- After applying, regenerate types: `supabase gen types typescript > src/types/database.generated.ts`

## Type Generation

`src/types/database.ts` exports convenience aliases:
- `Profile`, `Player`, `Ranking`, `PlayerMetrics`, `Challenge`, `Match`, `Notification`, `TreasuryEntry`, `LeagueSettings`, `RankedPlayer`

Use these instead of `Database['public']['Tables']['...']['Row']` chains. If a new table is added, extend `database.ts` with a new alias.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Creating a new supabase client in a component | Import from `src/lib/supabase.ts` |
| Validation only in UI | Always validate in edge function + RLS |
| Hardcoding role checks in SQL | Use a helper function or consistent join pattern |
| Leaking service role key | Service role is server-side only — never in client bundle |
| Forgetting to remove channel on unmount | Always return cleanup from useEffect |

## Verification

For Supabase changes:
- [ ] Migration runs cleanly on a fresh branch
- [ ] RLS tested with player + admin + super_admin accounts
- [ ] Edge function rejects unauthorized callers (401/403)
- [ ] Edge function validates input
- [ ] Types regenerated and committed
- [ ] No service role key in client code
