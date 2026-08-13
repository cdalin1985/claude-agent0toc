-- Runtime assertions for 20260813200000_align_repo_to_production.sql.
--
-- That migration exists because this repo could not rebuild production: 69
-- migrations were recorded there, 41 files exist here. This file proves the
-- alignment actually holds on a database built from the repo alone -- which is
-- precisely the database nobody had been checking.
--
-- BEHAVIOURAL where behaviour is the point. Two of the checks below are
-- privilege checks rather than data checks, and that is deliberate: the failure
-- they guard against is a SECURITY DEFINER function arriving unlocked, which
-- has no observable data signature until someone abuses it.
--
-- Every insert uses a fixed UUID and ON CONFLICT DO NOTHING, because the replay
-- workflow runs this file twice -- once on the fresh build and once after
-- re-applying the newest migrations to prove idempotency.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'PRODUCTION ALIGNMENT: ALL CHECKS PASSED' on success.

-- ---------------------------------------------------------------------------
-- 1. The activation columns exist AND the triggers maintain them.
-- ---------------------------------------------------------------------------
-- Asserting the columns exist would repeat the mistake this whole exercise is
-- about: production had the columns for three months while the repo did not,
-- and everything "passed" the entire time. So flip is_active and require the
-- timestamps to move.
DO $$
DECLARE
  p_id     uuid := '00000000-0000-4000-8000-0000000000b1';
  r        record;
  failures text[] := '{}';
BEGIN
  INSERT INTO players (id, full_name, is_active)
  VALUES (p_id, 'Alignment Subject', true)
  ON CONFLICT (id) DO UPDATE
    SET is_active = true, activated_at = NULL, inactivated_at = NULL;

  -- true -> false must stamp inactivated_at and leave activated_at alone.
  UPDATE players SET is_active = false WHERE id = p_id;
  SELECT activated_at, inactivated_at INTO r FROM players WHERE id = p_id;
  IF r.inactivated_at IS NULL THEN
    failures := array_append(failures,
      'deactivating a player did not set inactivated_at -- track_player_inactivation_trigger is missing');
  END IF;

  -- false -> true must stamp activated_at and CLEAR inactivated_at. The clear
  -- is what stops process_inactive_demotions from continuing to demote someone
  -- who has come back.
  UPDATE players SET is_active = true WHERE id = p_id;
  SELECT activated_at, inactivated_at INTO r FROM players WHERE id = p_id;
  IF r.activated_at IS NULL THEN
    failures := array_append(failures,
      'reactivating a player did not set activated_at -- track_player_activation_trigger is missing');
  END IF;
  IF r.inactivated_at IS NOT NULL THEN
    failures := array_append(failures,
      'reactivating a player left inactivated_at set -- a returning member would keep being demoted');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'PRODUCTION ALIGNMENT: % ACTIVATION CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. The two SECURITY DEFINER functions arrive LOCKED.
-- ---------------------------------------------------------------------------
-- The highest-value check in this file.
--
-- 20260612150000 and 20260517035030 lock these down behind `IF the function
-- exists`. On production that guard passed. On a fresh database the function
-- does not exist yet, the guard fails, and the lockdown silently skips -- so
-- whichever migration later creates the function hands it to the world with
-- Postgres's default EXECUTE TO PUBLIC.
--
-- process_inactive_demotions rewrites ladder positions. If this check ever
-- fails, any logged-in player can reorder the league.
--
-- 04_definer_privileges_assert.sql already enumerates pg_proc and would catch
-- either of these arriving unlocked. What it cannot catch is the function not
-- being there at all -- a generic sweep over "every SECURITY DEFINER function"
-- passes trivially on an empty set. That is the half this section adds, and it
-- is the half that actually went wrong: production had these for months while
-- the repo could not create them.
DO $$
DECLARE
  failures text[] := '{}';
BEGIN
  IF to_regprocedure('public.process_inactive_demotions()') IS NULL THEN
    failures := array_append(failures, 'process_inactive_demotions() does not exist');
  ELSE
    IF has_function_privilege('authenticated', 'public.process_inactive_demotions()', 'EXECUTE') THEN
      failures := array_append(failures,
        'any logged-in player can EXECUTE process_inactive_demotions() and reorder the ladder');
    END IF;
    IF has_function_privilege('anon', 'public.process_inactive_demotions()', 'EXECUTE') THEN
      failures := array_append(failures,
        'process_inactive_demotions() is executable without logging in');
    END IF;
  END IF;

  IF to_regprocedure('public.get_ranked_players()') IS NULL THEN
    failures := array_append(failures, 'get_ranked_players() does not exist');
  ELSE
    IF has_function_privilege('authenticated', 'public.get_ranked_players()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_ranked_players()', 'EXECUTE') THEN
      failures := array_append(failures,
        'get_ranked_players() is a SECURITY DEFINER function open to callers');
    END IF;
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'PRODUCTION ALIGNMENT: % PRIVILEGE CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. The raw treasury table is not readable by an ordinary member.
-- ---------------------------------------------------------------------------
-- 05_treasury_visibility_assert.sql proves members CAN read the two views.
-- This proves they CANNOT read the table underneath, which is the half that
-- was never asserted -- and the half a rebuild from the repo would have got
-- wrong, since 20260321032634 creates "Anyone can view treasury" USING (true).
DO $$
DECLARE
  u_member uuid := '00000000-0000-4000-8000-0000000000b2';
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u_member, 'alignment-member@example.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO profiles (id, email, display_name, role)
  VALUES (u_member, 'alignment-member@example.test', 'Alignment Member', 'player')
  ON CONFLICT (id) DO UPDATE SET role = 'player';

  INSERT INTO treasury_ledger (id, entry_type, amount_cents, description, created_by)
  VALUES ('00000000-0000-4000-8000-0000000000b3', 'credit', 500,
          'alignment assert fixture', u_member)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- A permissive SELECT policy would defeat the whole arrangement regardless of
-- what any single query returns, so pin its absence directly too.
DO $$
DECLARE
  failures text[] := '{}';
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'treasury_ledger'
       AND cmd = 'SELECT' AND COALESCE(qual, '') = 'true'
  ) THEN
    failures := array_append(failures,
      'treasury_ledger has a SELECT policy of USING (true) -- the raw ledger is open to every member');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'treasury_ledger' AND cmd = 'SELECT'
  ) THEN
    failures := array_append(failures,
      'treasury_ledger has no SELECT policy at all');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'PRODUCTION ALIGNMENT: % TREASURY POLICY CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000b2"}', false);
SET ROLE authenticated;

DO $$
DECLARE
  visible  integer;
  failures text[] := '{}';
BEGIN
  -- Either answer means the member cannot read the ledger: RLS filtering the
  -- rows away, or the table-level grant being absent entirely. Accepting both
  -- keeps this from pinning the mechanism instead of the outcome.
  BEGIN
    SELECT count(*) INTO visible FROM treasury_ledger;
    IF visible > 0 THEN
      failures := array_append(failures,
        'an ordinary member read ' || visible || ' row(s) straight out of treasury_ledger');
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'PRODUCTION ALIGNMENT: % TREASURY READ CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, false);

-- ---------------------------------------------------------------------------
-- 4. The avatars bucket cannot be listed; banners still can.
-- ---------------------------------------------------------------------------
-- Production dropped "Avatars are publicly accessible" (version 20260707034049)
-- because it allowed enumerating the bucket rather than fetching a known URL.
-- 20260323113442 in this repo still creates it, so a rebuild reintroduces it.
--
-- Checked as a pair: asserting only the absence would also pass if someone
-- deleted every storage policy in the repo.
DO $$
DECLARE
  failures text[] := '{}';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'storage' AND policyname = 'Avatars are publicly accessible') THEN
    failures := array_append(failures,
      'the avatars bucket listing policy is back -- anyone can enumerate every member avatar');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'storage' AND policyname = 'Banners are publicly accessible') THEN
    failures := array_append(failures,
      'the banners read policy is gone -- profile banners will not load');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'storage' AND policyname = 'Users can upload their own avatar') THEN
    failures := array_append(failures,
      'members can no longer upload an avatar');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'PRODUCTION ALIGNMENT: % STORAGE POLICY CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. The foreign-key indexes are present.
-- ---------------------------------------------------------------------------
-- Performance only, so this is a plain existence check -- there is no
-- behaviour to observe. Listed explicitly rather than counted, so a failure
-- names the missing index instead of reporting "expected 17, found 16".
DO $$
DECLARE
  wanted text[] := ARRAY[
    'idx_activity_feed_actor_player_id',
    'idx_audit_events_actor_profile_id',
    'idx_challenge_forfeiture_events_activity_event_id',
    'idx_challenge_forfeiture_events_challenger_id',
    'idx_challenge_forfeiture_events_cooldown_id',
    'idx_challenge_forfeiture_events_forfeiting_player_id',
    'idx_challenge_forfeiture_events_loser_id',
    'idx_challenge_forfeiture_events_reversed_by_profile_id',
    'idx_challenge_forfeiture_events_winner_id',
    'idx_matches_loser_id',
    'idx_matches_player1_id',
    'idx_matches_player1_submitted_winner_id',
    'idx_matches_player2_id',
    'idx_matches_player2_submitted_winner_id',
    'idx_matches_winner_id',
    'idx_treasury_ledger_created_by',
    'idx_treasury_ledger_player_id'
  ];
  ix       text;
  failures text[] := '{}';
BEGIN
  FOREACH ix IN ARRAY wanted LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ix) THEN
      failures := array_append(failures, 'missing index: ' || ix);
    END IF;
  END LOOP;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'PRODUCTION ALIGNMENT: % INDEX CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'PRODUCTION ALIGNMENT: ALL CHECKS PASSED'; END $$;
