-- Runtime assertions for 20260817101541_fix_inactive_demotion_position_shift.sql.
--
-- process_inactive_demotions() has run daily since May and always returned
-- demoted_count 0, because it only does anything once somebody has been
-- inactive for 30 days. Every one of those runs succeeded, so the cron history
-- looked healthy while the demotion path had never executed even once.
--
-- The path it had never executed raised a duplicate key error: it shifted
-- rankings.position in place against a non-deferrable UNIQUE constraint, moving
-- the first row of the block onto the position the demoted player had not yet
-- vacated.
--
-- So this file makes a demotion actually happen. Anything that merely called
-- the function against a healthy ladder would have passed for the last three
-- months.
--
-- Fixed UUIDs and ON CONFLICT throughout: the replay workflow runs every assert
-- file twice.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'INACTIVE DEMOTION: ALL CHECKS PASSED' on success.

DO $$
DECLARE
  -- Five players in a private block at the bottom of the ladder, so this never
  -- collides with fixtures seeded by another assert file.
  p1 uuid := '00000000-0000-4000-8000-0000000000e1';
  p2 uuid := '00000000-0000-4000-8000-0000000000e2';
  p3 uuid := '00000000-0000-4000-8000-0000000000e3';
  p4 uuid := '00000000-0000-4000-8000-0000000000e4';
  p5 uuid := '00000000-0000-4000-8000-0000000000e5';
  base            integer;
  result          jsonb;
  pos_inactive    integer;
  pos_p3          integer;
  pos_p4          integer;
  pos_p5          integer;
  dupes           integer;
  failures        text[] := '{}';
BEGIN
  INSERT INTO players (id, full_name, is_active) VALUES
    (p1, 'Demotion Anchor A',   true),
    (p2, 'Demotion Inactive',   true),
    (p3, 'Demotion Follower C', true),
    (p4, 'Demotion Follower D', true),
    (p5, 'Demotion Anchor E',   true)
  ON CONFLICT (id) DO NOTHING;

  -- Park them past every existing ranking so the block is contiguous and ours.
  SELECT COALESCE(max(position), 0) INTO base FROM rankings;

  INSERT INTO rankings (player_id, position) VALUES
    (p1, base + 1), (p2, base + 2), (p3, base + 3), (p4, base + 4), (p5, base + 5)
  ON CONFLICT (player_id) DO UPDATE SET position = EXCLUDED.position;

  -- 62 days inactive => floor(62/30) * 2 = 2 spots owed.
  --
  -- Two statements, deliberately. on_player_inactivation is a BEFORE UPDATE
  -- trigger that sets inactivated_at = NOW() whenever is_active goes true ->
  -- false, so doing both in one statement backdates nothing -- the trigger
  -- overwrites the value and the player reads as inactive for zero days. The
  -- second UPDATE leaves is_active alone, so neither activation trigger fires
  -- and the backdate survives.
  UPDATE players SET is_active = false WHERE id = p2;
  UPDATE players SET inactivated_at = NOW() - INTERVAL '62 days' WHERE id = p2;

  -- ------------------------------------------------------- the demotion ---
  -- Before the fix this raised: duplicate key value violates unique constraint
  -- "rankings_position_key".
  result := public.process_inactive_demotions();

  SELECT position INTO pos_inactive FROM rankings WHERE player_id = p2;
  SELECT position INTO pos_p3       FROM rankings WHERE player_id = p3;
  SELECT position INTO pos_p4       FROM rankings WHERE player_id = p4;
  SELECT position INTO pos_p5       FROM rankings WHERE player_id = p5;

  IF (result ->> 'demoted_count')::int < 1 THEN
    failures := array_append(failures,
      format('demoted_count was %s -- the inactive player was not demoted at all', result ->> 'demoted_count'));
  END IF;

  -- Down exactly two spots, and the two players he passed each move up one.
  IF pos_inactive IS DISTINCT FROM base + 4 THEN
    failures := array_append(failures,
      format('inactive player is at %s, expected %s (two spots down)', pos_inactive, base + 4));
  END IF;
  IF pos_p3 IS DISTINCT FROM base + 2 THEN
    failures := array_append(failures,
      format('the player directly below is at %s, expected %s', pos_p3, base + 2));
  END IF;
  IF pos_p4 IS DISTINCT FROM base + 3 THEN
    failures := array_append(failures,
      format('the next player down is at %s, expected %s', pos_p4, base + 3));
  END IF;
  -- Outside the shifted range: must not move. Catches an over-broad UPDATE
  -- that renumbers players the demotion never touched.
  IF pos_p5 IS DISTINCT FROM base + 5 THEN
    failures := array_append(failures,
      format('a player outside the shifted block moved: at %s, expected %s', pos_p5, base + 5));
  END IF;

  -- No row may be left parked at the +1000 offset, and the ladder must still be
  -- one player per position.
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
    RAISE EXCEPTION E'INACTIVE DEMOTION: % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Still locked down. It renumbers the ladder and is SECURITY DEFINER.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.process_inactive_demotions()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.process_inactive_demotions()', 'EXECUTE') THEN
    RAISE EXCEPTION 'INACTIVE DEMOTION: process_inactive_demotions() is callable by players -- any member could renumber the ladder';
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'INACTIVE DEMOTION: ALL CHECKS PASSED'; END $$;
