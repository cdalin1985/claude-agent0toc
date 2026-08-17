-- Runtime assertions for 20260817095214_expire_challenges_on_a_schedule.sql.
--
-- The bug was not that expire_stale_challenges() was wrong -- it has been
-- correct since May. It was that nothing ran it, so challenges never expired,
-- the Challenges screen said "Expiring soon" forever, and a player could accept
-- or decline weeks after the window shut. Asserting that the function EXISTS
-- would have passed throughout. So this runs it and checks what it did.
--
-- Every insert uses fixed UUIDs and ON CONFLICT: the replay workflow executes
-- each assert file twice, once on the fresh build and once after re-applying
-- the newest migrations.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'CHALLENGE EXPIRY: ALL CHECKS PASSED' on success.

-- ---------------------------------------------------------------------------
-- Seed. Four players, because idx_challenges_one_active_per_challenger and
-- idx_challenges_one_active_per_challenged are unique over the active statuses
-- ('pending','accepted','scheduled','in_progress') -- two simultaneously
-- pending challenges cannot share a participant.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p_stale_from uuid := '00000000-0000-4000-8000-0000000000d1';
  p_stale_to   uuid := '00000000-0000-4000-8000-0000000000d2';
  p_live_from  uuid := '00000000-0000-4000-8000-0000000000d3';
  p_live_to    uuid := '00000000-0000-4000-8000-0000000000d4';
  c_stale      uuid := '00000000-0000-4000-8000-0000000000d5';
  c_live       uuid := '00000000-0000-4000-8000-0000000000d6';
  swept        integer;
  stale_status text;
  live_status  text;
  failures     text[] := '{}';
BEGIN
  INSERT INTO players (id, full_name) VALUES
    (p_stale_from, 'Expiry Stale Challenger'),
    (p_stale_to,   'Expiry Stale Challenged'),
    (p_live_from,  'Expiry Live Challenger'),
    (p_live_to,    'Expiry Live Challenged')
  ON CONFLICT (id) DO NOTHING;

  -- One challenge whose window shut two days ago, one with a day still to run.
  -- race_length 6 satisfies the minimum from 20260625020000; discipline must be
  -- one of the three the CHECK allows.
  INSERT INTO challenges (id, challenger_id, challenged_id, discipline, race_length, status, expires_at)
  VALUES
    (c_stale, p_stale_from, p_stale_to, '8 Ball', 6, 'pending', NOW() - INTERVAL '2 days'),
    (c_live,  p_live_from,  p_live_to,  '9 Ball', 6, 'pending', NOW() + INTERVAL '1 day')
  ON CONFLICT (id) DO UPDATE
    SET status     = 'pending',
        expires_at = EXCLUDED.expires_at;

  -- ------------------------------------------------------ the sweep runs ---
  SELECT public.expire_stale_challenges() INTO swept;

  SELECT status INTO stale_status FROM challenges WHERE id = c_stale;
  SELECT status INTO live_status  FROM challenges WHERE id = c_live;

  IF stale_status IS DISTINCT FROM 'expired' THEN
    failures := array_append(failures,
      format('a challenge two days past its window is still %L -- members can act on a dead challenge', stale_status));
  END IF;

  -- Without this the whole file would pass if the function expired everything,
  -- which would silently cancel every live challenge in the league.
  IF live_status IS DISTINCT FROM 'pending' THEN
    failures := array_append(failures,
      format('a challenge with a day left was swept to %L -- the sweeper is eating live challenges', live_status));
  END IF;

  IF swept < 1 THEN
    failures := array_append(failures,
      format('expire_stale_challenges() reported %s rows swept; expected at least the one seeded here', swept));
  END IF;

  -- Idempotent: running it again must not touch the row it already settled.
  PERFORM public.expire_stale_challenges();
  SELECT status INTO stale_status FROM challenges WHERE id = c_stale;
  IF stale_status IS DISTINCT FROM 'expired' THEN
    failures := array_append(failures, 'a second sweep changed an already-expired challenge');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'CHALLENGE EXPIRY: % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- The schedule itself, where there is a scheduler to inspect.
-- ---------------------------------------------------------------------------
-- CI replays migrations against a plain Postgres 17 with no pg_cron, so this
-- section can only run against a database that has it (production, or a local
-- Supabase). Skipping loudly rather than silently: a quiet skip is how a check
-- ends up never running anywhere and nobody noticing.
DO $$
DECLARE
  failures text[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'CHALLENGE EXPIRY: pg_cron absent, skipping schedule checks (expected in CI)';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'challenge-expiry-check' AND active) THEN
    failures := array_append(failures,
      'no active challenge-expiry-check job -- challenges will stop expiring again');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inactive-demotion-check' AND active) THEN
    failures := array_append(failures,
      'no active inactive-demotion-check job -- process_inactive_demotions has no caller');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'CHALLENGE EXPIRY: % SCHEDULE CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'CHALLENGE EXPIRY: ALL CHECKS PASSED'; END $$;
