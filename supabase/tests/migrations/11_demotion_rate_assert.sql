-- Runtime assertions for 20260822130000_demote_two_spots_per_30_days_not_per_day.sql.
--
-- The rule is two spots per 30 days. The old function derived the spots owed
-- from elapsed time alone and applied them relative to the player's CURRENT
-- position, recording nothing -- and the cron runs daily. So for every day of
-- days 30..59 it computed "2 owed" and took two more spots from wherever
-- yesterday left them: a member owed 2 spots a month lost 2 a day.
--
-- 10_inactive_demotion_assert.sql could not catch this. It calls the function
-- once per scenario, and one call is exactly the case the bug gets right.
-- The defect only appears on the SECOND run inside the same 30-day bucket,
-- which is precisely what the daily schedule does 29 times in a row.
--
-- So the whole point of this file is calling it twice.
--
--   C. two runs inside one 30-day bucket move the player once
--   D. crossing into the next bucket takes exactly two more, not the whole
--      debt over again
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'DEMOTION RATE: ALL CHECKS PASSED' on success.

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
-- Deliberately a private copy rather than a call into 10_'s helper: pg_temp is
-- per-session and each assert file is its own psql invocation, so sharing one
-- would work locally and fail in CI. Same shape and the same reasons -- see
-- 10_inactive_demotion_assert.sql for why the ladder is compacted first and why
-- the inactivation is three statements.
CREATE OR REPLACE FUNCTION pg_temp.seed_rate_block(
  p1 uuid, p2 uuid, p3 uuid, p4 uuid, p5 uuid, p6 uuid, p7 uuid,
  p_inactive_days integer
) RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE
  v_base integer;
  v_max  integer;
  v_cnt  integer;
BEGIN
  INSERT INTO players (id, full_name, is_active) VALUES
    (p1, 'Rate Anchor A',   true),
    (p2, 'Rate Inactive',   true),
    (p3, 'Rate Follower C', true),
    (p4, 'Rate Follower D', true),
    (p5, 'Rate Follower E', true),
    (p6, 'Rate Follower F', true),
    (p7, 'Rate Anchor G',   true)
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM rankings WHERE player_id IN (p1, p2, p3, p4, p5, p6, p7);

  UPDATE rankings SET position = position + 1000;
  WITH ordered AS (
    SELECT player_id, row_number() OVER (ORDER BY position) AS rn FROM rankings
  )
  UPDATE rankings r SET position = o.rn FROM ordered o WHERE r.player_id = o.player_id;

  SELECT COALESCE(max(position), 0), count(*) INTO v_max, v_cnt FROM rankings;
  IF v_max <> v_cnt THEN
    RAISE EXCEPTION
      'DEMOTION RATE: compaction did not produce a contiguous ladder (max position %, % rows).',
      v_max, v_cnt;
  END IF;
  v_base := v_cnt;

  -- Seven players, so a 4-spot fall from slot 2 still lands mid-block and the
  -- bottom cap never fires. This file is about the RATE; least() capping at the
  -- bottom is 10_'s scenario B and would mask a wrong rate here.
  INSERT INTO rankings (player_id, position) VALUES
    (p1, v_base + 1), (p2, v_base + 2), (p3, v_base + 3), (p4, v_base + 4),
    (p5, v_base + 5), (p6, v_base + 6), (p7, v_base + 7);

  UPDATE players SET is_active = true, inactivated_at = NULL WHERE id = p2;
  UPDATE players SET is_active = false WHERE id = p2;
  UPDATE players SET inactivated_at = NOW() - make_interval(days => p_inactive_days)
   WHERE id = p2;

  RETURN v_base;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- C. Two runs inside one 30-day bucket move the player exactly once
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p1 uuid := '00000000-0000-4000-8000-0000000000f1';
  p2 uuid := '00000000-0000-4000-8000-0000000000f2';
  p3 uuid := '00000000-0000-4000-8000-0000000000f3';
  p4 uuid := '00000000-0000-4000-8000-0000000000f4';
  p5 uuid := '00000000-0000-4000-8000-0000000000f5';
  p6 uuid := '00000000-0000-4000-8000-0000000000f6';
  p7 uuid := '00000000-0000-4000-8000-0000000000f7';
  base          integer;
  first_run     jsonb;
  second_run    jsonb;
  pos_after_one integer;
  pos_after_two integer;
  ledger        integer;
  dupes         integer;
  failures      text[] := '{}';
BEGIN
  -- 45 days: one completed 30-day bucket, so 2 spots owed in total.
  base := pg_temp.seed_rate_block(p1, p2, p3, p4, p5, p6, p7, 45);

  first_run := public.process_inactive_demotions();
  SELECT position INTO pos_after_one FROM rankings WHERE player_id = p2;

  -- The next day's cron, with nothing else changed. Under the old function this
  -- was another 2 spots, every single day, all the way to last place.
  second_run := public.process_inactive_demotions();
  SELECT position INTO pos_after_two FROM rankings WHERE player_id = p2;
  SELECT inactive_drops_applied INTO ledger FROM players WHERE id = p2;

  IF pos_after_one IS DISTINCT FROM base + 4 THEN
    failures := array_append(failures,
      format('after one run the inactive player is at %s, expected %s (two spots down)', pos_after_one, base + 4));
  END IF;

  -- The assertion this file exists for.
  IF pos_after_two IS DISTINCT FROM pos_after_one THEN
    failures := array_append(failures,
      format('a second run inside the same 30-day bucket moved the player again: %s -> %s. The rule is two spots per 30 days, not per run',
             pos_after_one, pos_after_two));
  END IF;

  IF (second_run ->> 'demoted_count')::int <> 0 THEN
    failures := array_append(failures,
      format('the second run reported demoted_count %s, expected 0 -- nothing was owed', second_run ->> 'demoted_count'));
  END IF;

  IF ledger IS DISTINCT FROM 2 THEN
    failures := array_append(failures,
      format('inactive_drops_applied is %s after two runs, expected 2', ledger));
  END IF;

  IF (first_run ->> 'demoted_count')::int < 1 THEN
    failures := array_append(failures,
      format('the first run reported demoted_count %s -- the demotion did not happen at all', first_run ->> 'demoted_count'));
  END IF;

  IF EXISTS (SELECT 1 FROM rankings WHERE position > 1000) THEN
    failures := array_append(failures,
      'a ranking row was left parked above 1000 -- the offset was not unwound');
  END IF;

  SELECT count(*) INTO dupes FROM (
    SELECT position FROM rankings GROUP BY position HAVING count(*) > 1
  ) d;
  IF dupes > 0 THEN
    failures := array_append(failures, format('%s ladder position(s) are held by more than one player', dupes));
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'DEMOTION RATE (same bucket): % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- D. Crossing into the next bucket takes exactly two more
-- ---------------------------------------------------------------------------
-- The ledger must not overshoot in the other direction either: a player who has
-- already been charged for month one owes 2 more when month two completes, not
-- 4, and not 0.
DO $$
DECLARE
  p1 uuid := '00000000-0000-4000-8000-0000000000f1';
  p2 uuid := '00000000-0000-4000-8000-0000000000f2';
  p3 uuid := '00000000-0000-4000-8000-0000000000f3';
  p4 uuid := '00000000-0000-4000-8000-0000000000f4';
  p5 uuid := '00000000-0000-4000-8000-0000000000f5';
  p6 uuid := '00000000-0000-4000-8000-0000000000f6';
  p7 uuid := '00000000-0000-4000-8000-0000000000f7';
  base            integer;
  pos_month_one   integer;
  pos_month_two   integer;
  ledger          integer;
  pos_p7          integer;
  failures        text[] := '{}';
BEGIN
  base := pg_temp.seed_rate_block(p1, p2, p3, p4, p5, p6, p7, 45);

  -- Month one.
  PERFORM public.process_inactive_demotions();
  SELECT position INTO pos_month_one FROM rankings WHERE player_id = p2;

  -- Age them into month two without touching is_active, so no trigger fires and
  -- the ledger survives -- which is the whole point of the check.
  UPDATE players SET inactivated_at = NOW() - INTERVAL '62 days' WHERE id = p2;

  PERFORM public.process_inactive_demotions();
  SELECT position INTO pos_month_two FROM rankings WHERE player_id = p2;
  SELECT inactive_drops_applied INTO ledger FROM players WHERE id = p2;
  SELECT position INTO pos_p7 FROM rankings WHERE player_id = p7;

  IF pos_month_one IS DISTINCT FROM base + 4 THEN
    failures := array_append(failures,
      format('after month one the player is at %s, expected %s', pos_month_one, base + 4));
  END IF;

  -- 4 earned total, 2 already taken, so 2 more -- landing 4 below where they started.
  IF pos_month_two IS DISTINCT FROM base + 6 THEN
    failures := array_append(failures,
      format('after month two the player is at %s, expected %s (two more spots, not the whole debt again)',
             pos_month_two, base + 6));
  END IF;

  IF ledger IS DISTINCT FROM 4 THEN
    failures := array_append(failures,
      format('inactive_drops_applied is %s after two months, expected 4', ledger));
  END IF;

  -- The player below the landing spot must not have been dragged along.
  IF pos_p7 IS DISTINCT FROM base + 7 THEN
    failures := array_append(failures,
      format('a player outside the shifted block moved: at %s, expected %s', pos_p7, base + 7));
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'DEMOTION RATE (next bucket): % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- E. Reactivation clears the ledger
-- ---------------------------------------------------------------------------
-- Miss this and a member who goes inactive, returns, and goes inactive again a
-- year later starts the new spell already paid up, and never drops at all.
DO $$
DECLARE
  p1 uuid := '00000000-0000-4000-8000-0000000000f1';
  p2 uuid := '00000000-0000-4000-8000-0000000000f2';
  p3 uuid := '00000000-0000-4000-8000-0000000000f3';
  p4 uuid := '00000000-0000-4000-8000-0000000000f4';
  p5 uuid := '00000000-0000-4000-8000-0000000000f5';
  p6 uuid := '00000000-0000-4000-8000-0000000000f6';
  p7 uuid := '00000000-0000-4000-8000-0000000000f7';
  ledger_after_demotion integer;
  ledger_after_return   integer;
  failures              text[] := '{}';
BEGIN
  PERFORM pg_temp.seed_rate_block(p1, p2, p3, p4, p5, p6, p7, 45);
  PERFORM public.process_inactive_demotions();
  SELECT inactive_drops_applied INTO ledger_after_demotion FROM players WHERE id = p2;

  UPDATE players SET is_active = true WHERE id = p2;
  SELECT inactive_drops_applied INTO ledger_after_return FROM players WHERE id = p2;

  IF ledger_after_demotion IS DISTINCT FROM 2 THEN
    failures := array_append(failures,
      format('ledger is %s after the demotion, expected 2', ledger_after_demotion));
  END IF;
  IF ledger_after_return IS DISTINCT FROM 0 THEN
    failures := array_append(failures,
      format('ledger is %s after reactivation, expected 0 -- a returning player must start their next spell owing nothing',
             ledger_after_return));
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'DEMOTION RATE (reactivation): % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'DEMOTION RATE: ALL CHECKS PASSED'; END $$;
