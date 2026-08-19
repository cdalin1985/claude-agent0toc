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
-- Two scenarios, because the function has two outcomes worth pinning:
--
--   A. a demotion that lands mid-ladder, where the players passed move up one
--      and everyone below is untouched
--   B. a demotion whose owed drops run past the bottom, where least() caps the
--      landing spot at the last position
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'INACTIVE DEMOTION: ALL CHECKS PASSED' on success.

-- ---------------------------------------------------------------------------
-- Shared fixture helper
-- ---------------------------------------------------------------------------
-- Seeds five players in a contiguous block at the bottom of the ladder and
-- returns the position immediately above the block.
--
-- The rankings rows are DELETEd before being re-inserted rather than upserted
-- in place. Two reasons, both of which have already bitten this file:
--
--   1. The replay workflow runs every assert twice. Deriving the block from
--      max(position) while the previous pass's rows are still down there walks
--      the block further down each time, leaving a gap behind it. The function
--      caps its landing spot with count(*), not max(position), so a gap makes
--      v_new_pos land ABOVE v_current_pos, the IF guard goes false, and nothing
--      is demoted at all -- a test that silently stops testing.
--
--   2. Upserting a permuted block violates the UNIQUE on position partway
--      through, because a multi-row upsert is applied row by row.
--
-- Deleting first makes the fixture identical on every pass.
CREATE OR REPLACE FUNCTION pg_temp.seed_demotion_block(
  p1 uuid, p2 uuid, p3 uuid, p4 uuid, p5 uuid, p_inactive_days integer
) RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE
  v_base integer;
  v_max  integer;
  v_cnt  integer;
BEGIN
  INSERT INTO players (id, full_name, is_active) VALUES
    (p1, 'Demotion Anchor A',   true),
    (p2, 'Demotion Inactive',   true),
    (p3, 'Demotion Follower C', true),
    (p4, 'Demotion Follower D', true),
    (p5, 'Demotion Anchor E',   true)
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM rankings WHERE player_id IN (p1, p2, p3, p4, p5);

  -- Compact the remaining ladder to a dense 1..N before appending the block.
  --
  -- process_inactive_demotions caps its landing spot with least(..., count(*)),
  -- so it only behaves sanely on a ladder with no holes. Production has one;
  -- a shared test database does not. This block previously ran second, after
  -- other assert files had appended their own fixtures below it, so deleting it
  -- left a hole in the MIDDLE -- count(*) then sat below the block's own
  -- positions and the cap became nonsense. Establish the precondition rather
  -- than assume it, and the fixture stops depending on which files ran first.
  --
  -- Park at +1000 before renumbering: shifting positions in place against the
  -- non-deferrable UNIQUE is the exact bug this file exists to catch. The live
  -- ladder is ~100 rows, so [1001, ...] is empty and the shift cannot collide.
  UPDATE rankings SET position = position + 1000;
  WITH ordered AS (
    SELECT player_id, row_number() OVER (ORDER BY position) AS rn FROM rankings
  )
  UPDATE rankings r SET position = o.rn FROM ordered o WHERE r.player_id = o.player_id;

  SELECT COALESCE(max(position), 0), count(*) INTO v_max, v_cnt FROM rankings;
  IF v_max <> v_cnt THEN
    RAISE EXCEPTION
      'INACTIVE DEMOTION: compaction did not produce a contiguous ladder (max position %, % rows).',
      v_max, v_cnt;
  END IF;
  v_base := v_cnt;

  INSERT INTO rankings (player_id, position) VALUES
    (p1, v_base + 1), (p2, v_base + 2), (p3, v_base + 3),
    (p4, v_base + 4), (p5, v_base + 5);

  -- Three statements, deliberately. on_player_inactivation is a BEFORE UPDATE
  -- trigger that sets inactivated_at = NOW() whenever is_active goes true ->
  -- false, so inactivating and backdating in one statement backdates nothing --
  -- the trigger overwrites the value and the player reads as inactive for zero
  -- days. Resetting to active first makes the trigger fire identically on every
  -- replay pass; the final UPDATE leaves is_active alone, so no activation
  -- trigger fires and the backdate survives.
  UPDATE players SET is_active = true, inactivated_at = NULL WHERE id = p2;
  UPDATE players SET is_active = false WHERE id = p2;
  UPDATE players SET inactivated_at = NOW() - make_interval(days => p_inactive_days)
   WHERE id = p2;

  RETURN v_base;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- A. A demotion that lands mid-ladder
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p1 uuid := '00000000-0000-4000-8000-0000000000e1';
  p2 uuid := '00000000-0000-4000-8000-0000000000e2';
  p3 uuid := '00000000-0000-4000-8000-0000000000e3';
  p4 uuid := '00000000-0000-4000-8000-0000000000e4';
  p5 uuid := '00000000-0000-4000-8000-0000000000e5';
  base         integer;
  result       jsonb;
  pos_inactive integer;
  pos_p3       integer;
  pos_p4       integer;
  pos_p5       integer;
  dupes        integer;
  failures     text[] := '{}';
BEGIN
  -- drops_owed = floor(days / 30) * 2. 45 days -> floor(1.5) * 2 = 2.
  --
  -- Not 62. floor(62 / 30) * 2 is 4, not 2 -- and from the second slot of a
  -- five-player block at the bottom of the ladder, 4 owed drops run past the
  -- last position, so least() capped the landing spot and the player at the
  -- END of the block got shifted up too. That is correct behaviour, and it is
  -- asserted as scenario B; using 62 here quietly destroyed this scenario's
  -- point, which is that a mid-ladder demotion leaves everyone below it alone.
  base := pg_temp.seed_demotion_block(p1, p2, p3, p4, p5, 45);

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
    RAISE EXCEPTION E'INACTIVE DEMOTION (mid-ladder): % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- B. A demotion whose owed drops run off the bottom of the ladder
-- ---------------------------------------------------------------------------
-- v_new_pos := least(v_current_pos + v_drops_owed, v_total_players). Nothing
-- exercised that least() before, which is how scenario A came to be written
-- against a duration that silently triggered it.
DO $$
DECLARE
  p1 uuid := '00000000-0000-4000-8000-0000000000e1';
  p2 uuid := '00000000-0000-4000-8000-0000000000e2';
  p3 uuid := '00000000-0000-4000-8000-0000000000e3';
  p4 uuid := '00000000-0000-4000-8000-0000000000e4';
  p5 uuid := '00000000-0000-4000-8000-0000000000e5';
  base         integer;
  ladder_size  integer;
  result       jsonb;
  pos_inactive integer;
  pos_p3       integer;
  pos_p4       integer;
  pos_p5       integer;
  dupes        integer;
  failures     text[] := '{}';
BEGIN
  -- 62 days -> floor(62 / 30) * 2 = 4 owed. From base + 2 that would be
  -- base + 6, one past the bottom of a ladder whose last position is base + 5.
  base := pg_temp.seed_demotion_block(p1, p2, p3, p4, p5, 62);

  SELECT count(*) INTO ladder_size FROM rankings;

  result := public.process_inactive_demotions();

  SELECT position INTO pos_inactive FROM rankings WHERE player_id = p2;
  SELECT position INTO pos_p3       FROM rankings WHERE player_id = p3;
  SELECT position INTO pos_p4       FROM rankings WHERE player_id = p4;
  SELECT position INTO pos_p5       FROM rankings WHERE player_id = p5;

  IF (result ->> 'demoted_count')::int < 1 THEN
    failures := array_append(failures,
      format('demoted_count was %s -- the inactive player was not demoted at all', result ->> 'demoted_count'));
  END IF;

  -- Capped at the last position, NOT base + 6.
  IF pos_inactive IS DISTINCT FROM base + 5 THEN
    failures := array_append(failures,
      format('inactive player is at %s, expected %s (capped at the bottom of the ladder)', pos_inactive, base + 5));
  END IF;
  IF pos_inactive > ladder_size THEN
    failures := array_append(failures,
      format('inactive player is at %s, past the bottom of a %s-player ladder -- least() did not cap', pos_inactive, ladder_size));
  END IF;
  -- All three players below the mover shift up one, this time including the
  -- one scenario A holds still.
  IF pos_p3 IS DISTINCT FROM base + 2 THEN
    failures := array_append(failures, format('follower C is at %s, expected %s', pos_p3, base + 2));
  END IF;
  IF pos_p4 IS DISTINCT FROM base + 3 THEN
    failures := array_append(failures, format('follower D is at %s, expected %s', pos_p4, base + 3));
  END IF;
  IF pos_p5 IS DISTINCT FROM base + 4 THEN
    failures := array_append(failures, format('anchor E is at %s, expected %s', pos_p5, base + 4));
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
    RAISE EXCEPTION E'INACTIVE DEMOTION (bottom cap): % CHECK(S) FAILED\n  - %',
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
