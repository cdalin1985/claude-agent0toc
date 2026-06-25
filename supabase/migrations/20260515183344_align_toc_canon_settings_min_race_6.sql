-- Recovered from Supabase migration history (version 20260515183344).
-- Source: supabase_migrations.schema_migrations
-- Name: align_toc_canon_settings_min_race_6

-- first_challenge_range and challenge_weekly_limit were added directly to
-- production via the dashboard and never captured in a migration. Add them
-- here, idempotently, so fresh preview branches have these columns before
-- this and later migrations/edge functions read or write to them.
ALTER TABLE public.league_settings
  ADD COLUMN IF NOT EXISTS first_challenge_range INTEGER NOT NULL DEFAULT 10;
ALTER TABLE public.league_settings
  ADD COLUMN IF NOT EXISTS challenge_weekly_limit INTEGER NOT NULL DEFAULT 2;

update public.league_settings
set
  min_race = 6,
  challenge_range = 5,
  cooldown_hours = 24,
  first_challenge_range = 5,
  updated_at = now();

insert into public.audit_events (action, target_type, detail)
values (
  'canon_settings_aligned',
  'league_settings',
  jsonb_build_object(
    'min_race', 6,
    'challenge_range', 5,
    'cooldown_hours', 24,
    'first_challenge_range', 5,
    'note', 'Aligned live TOC settings: minimum race remains 6; standard challenge range is 5; post-loss cooldown is 24 hours; removed first-challenge 10-rank exception by setting it to 5.'
  )
);
