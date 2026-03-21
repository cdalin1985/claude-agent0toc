# TOC App — Setup Guide

## Step 1: Run SQL Migrations in Supabase

Go to: https://supabase.com/dashboard/project/kdpyisylihlvxvinzgyr/sql/new

Copy and paste the contents of `supabase/migrations/001_schema.sql` → Run
Copy and paste the contents of `supabase/migrations/002_seed.sql` → Run
Copy and paste the contents of `supabase/migrations/003_rls.sql` → Run

## Step 2: Get Your Service Role Key

Go to: https://supabase.com/dashboard/project/kdpyisylihlvxvinzgyr/settings/api

Copy the **service_role** key (the long one under "Project API keys")

## Step 3: Deploy Edge Functions

```bash
# Get a Supabase access token from: https://supabase.com/dashboard/account/tokens
export SUPABASE_ACCESS_TOKEN=your_token_here

npx supabase link --project-ref kdpyisylihlvxvinzgyr
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

npx supabase functions deploy claim-player
npx supabase functions deploy create-challenge
npx supabase functions deploy respond-to-challenge
npx supabase functions deploy update-match-score
npx supabase functions deploy submit-result
npx supabase functions deploy resolve-dispute
npx supabase functions deploy manage-treasury
```

## Step 4: Set Chase as Super Admin

After you claim your player profile (Chase Dalin), run in Supabase SQL Editor:
```sql
UPDATE profiles SET role = 'super_admin' WHERE email = 'chase.dalin@gmail.com';
```

## Step 5: Deploy to Vercel

1. Go to vercel.com → New Project → Import from GitHub
2. Select `cdalin1985/claude-agent0toc`
3. Framework: Vite
4. Add env vars:
   - VITE_SUPABASE_URL = https://kdpyisylihlvxvinzgyr.supabase.co
   - VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
5. Deploy!
