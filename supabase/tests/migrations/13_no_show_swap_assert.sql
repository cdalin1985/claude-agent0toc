-- Runtime assertions for 20260822150000_no_show_spot_swap.sql.
--
--   "A no show w/o letting your opponent know will drop you to the challengers
--    original spot. Both players will swap spots in the standings."
--
-- The interesting cases are not "did the two rows exchange numbers". They are:
--
--   A. the ordinary case -- the higher-ranked player fails to appear and the
--      two genuinely swap, with everybody else untouched
--   B. the reading past the literal text -- when the no-show is ALREADY below
--      their opponent, an always-swap would PROMOTE them for not turning up,
--      so the ladder must not move
--   C. a challenge with no arranged match cannot produce a no-show at all
--   D. the function is not callable by players, because it is an accusation
--      about somebody else and the penalty is a rank change
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'NO-SHOW SWAP: ALL CHECKS PASSED' on success.

CREATE OR REPLACE FUNCTION pg_temp.seed_no_show(
  p_high uuid, p_low uuid, p_bystander uuid, p_challenge uuid,
  p_challenger uuid, p_challenged uuid
) RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE
  v_base integer;
BEGIN
  INSERT INTO players (id, full_name, is_active) VALUES
    (p_high,      'No-show Upper',     true),
    (p_low,       'No-show Lower',     true),
    (p_bystander, 'No-show Bystander', true)
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM matches    WHERE challenge_id = p_challenge;
  DELETE FROM challenges WHERE id = p_challenge;
  DELETE FROM rankings   WHERE player_id IN (p_high, p_low, p_bystander);

  SELECT COALESCE(max(position), 0) INTO v_base FROM rankings;

  -- Upper sits directly above Lower; the bystander sits below both and must not
  -- move, which is what catches a swap implemented as a cascade.
  INSERT INTO rankings (player_id, position) VALUES
    (p_high, v_base + 1), (p_low, v_base + 2), (p_bystander, v_base + 3);

  INSERT INTO challenges (id, challenger_id, challenged_id, discipline, race_length, status, expires_at)
  VALUES (p_challenge, p_challenger, p_challenged, '9 Ball', 7, 'scheduled', now() + INTERVAL '2 days');

  RETURN v_base;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- A. The ordinary case: the higher-ranked player does not appear
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p_high  uuid := '00000000-0000-4000-8000-00000000d001';
  p_low   uuid := '00000000-0000-4000-8000-00000000d002';
  p_by    uuid := '00000000-0000-4000-8000-00000000d003';
  p_chal  uuid := '00000000-0000-4000-8000-00000000d0c1';
  base       integer;
  result     jsonb;
  pos_high   integer;
  pos_low    integer;
  pos_by     integer;
  v_status   text;
  v_reason   text;
  dupes      integer;
  failures   text[] := '{}';
BEGIN
  -- Lower challenges Upper; Upper fails to turn up.
  base := pg_temp.seed_no_show(p_high, p_low, p_by, p_chal, p_low, p_high);

  result := public.apply_no_show_swap(p_chal, p_high);

  SELECT position INTO pos_high FROM rankings WHERE player_id = p_high;
  SELECT position INTO pos_low  FROM rankings WHERE player_id = p_low;
  SELECT position INTO pos_by   FROM rankings WHERE player_id = p_by;
  SELECT status, cancel_reason INTO v_status, v_reason FROM challenges WHERE id = p_chal;

  IF NOT (result ->> 'swapped')::boolean THEN
    failures := array_append(failures, 'the function reported swapped=false when the no-show was above their opponent');
  END IF;
  IF pos_high IS DISTINCT FROM base + 2 THEN
    failures := array_append(failures,
      format('the no-show is at %s, expected %s (their opponent''s old spot)', pos_high, base + 2));
  END IF;
  IF pos_low IS DISTINCT FROM base + 1 THEN
    failures := array_append(failures,
      format('the player who showed up is at %s, expected %s', pos_low, base + 1));
  END IF;
  -- A swap moves exactly two rows. Anything that shifts the bystander is a
  -- cascade, which is a different rule.
  IF pos_by IS DISTINCT FROM base + 3 THEN
    failures := array_append(failures,
      format('a bystander moved: at %s, expected %s -- a no-show swaps two players, it does not cascade', pos_by, base + 3));
  END IF;
  IF v_status IS DISTINCT FROM 'cancelled' OR v_reason IS DISTINCT FROM 'no_show' THEN
    failures := array_append(failures,
      format('the challenge is %s/%s, expected cancelled/no_show', v_status, v_reason));
  END IF;

  IF EXISTS (SELECT 1 FROM rankings WHERE position > 1000) THEN
    failures := array_append(failures, 'a ranking row was left parked above 1000 -- the offset was not unwound');
  END IF;
  SELECT count(*) INTO dupes FROM (
    SELECT position FROM rankings GROUP BY position HAVING count(*) > 1
  ) d;
  IF dupes > 0 THEN
    failures := array_append(failures, format('%s ladder position(s) are held by more than one player', dupes));
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'NO-SHOW SWAP (ordinary): % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- B. The no-show is already below their opponent
-- ---------------------------------------------------------------------------
-- A top-10 player may challenge DOWN, so the challenger can outrank the
-- challenged, and either of them can be the one who fails to appear. Applied
-- literally as "both players swap spots", a lower-ranked no-show would be
-- promoted for it. The ladder must not move.
DO $$
DECLARE
  p_high  uuid := '00000000-0000-4000-8000-00000000d001';
  p_low   uuid := '00000000-0000-4000-8000-00000000d002';
  p_by    uuid := '00000000-0000-4000-8000-00000000d003';
  p_chal  uuid := '00000000-0000-4000-8000-00000000d0c2';
  base      integer;
  result    jsonb;
  pos_high  integer;
  pos_low   integer;
  v_reason  text;
  failures  text[] := '{}';
BEGIN
  -- Upper challenges down to Lower; Lower fails to turn up.
  base := pg_temp.seed_no_show(p_high, p_low, p_by, p_chal, p_high, p_low);

  result := public.apply_no_show_swap(p_chal, p_low);

  SELECT position INTO pos_high FROM rankings WHERE player_id = p_high;
  SELECT position INTO pos_low  FROM rankings WHERE player_id = p_low;
  SELECT cancel_reason INTO v_reason FROM challenges WHERE id = p_chal;

  IF (result ->> 'swapped')::boolean THEN
    failures := array_append(failures,
      'the ladder swapped a no-show who was already BELOW their opponent -- that promotes a player for not turning up');
  END IF;
  IF pos_low IS DISTINCT FROM base + 2 THEN
    failures := array_append(failures,
      format('the no-show moved to %s, expected to stay at %s', pos_low, base + 2));
  END IF;
  IF pos_high IS DISTINCT FROM base + 1 THEN
    failures := array_append(failures,
      format('the player who showed up moved to %s, expected to stay at %s', pos_high, base + 1));
  END IF;
  -- Still recorded, even though nothing moved: the history has to show it
  -- happened.
  IF v_reason IS DISTINCT FROM 'no_show' THEN
    failures := array_append(failures,
      format('the challenge cancel_reason is %s, expected no_show even with no ladder change', v_reason));
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'NO-SHOW SWAP (already below): % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- C. No arranged match, no no-show
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p_high  uuid := '00000000-0000-4000-8000-00000000d001';
  p_low   uuid := '00000000-0000-4000-8000-00000000d002';
  p_by    uuid := '00000000-0000-4000-8000-00000000d003';
  p_chal  uuid := '00000000-0000-4000-8000-00000000d0c3';
  raised  boolean := false;
BEGIN
  PERFORM pg_temp.seed_no_show(p_high, p_low, p_by, p_chal, p_low, p_high);
  -- Still pending: never accepted, so no time was ever agreed to miss.
  UPDATE challenges SET status = 'pending' WHERE id = p_chal;

  BEGIN
    PERFORM public.apply_no_show_swap(p_chal, p_high);
  EXCEPTION WHEN check_violation THEN
    raised := true;
  END;

  IF NOT raised THEN
    RAISE EXCEPTION
      'NO-SHOW SWAP (unarranged): a pending challenge produced a no-show penalty -- there was no arranged match to miss';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- D. A player cannot apply this to somebody else
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.apply_no_show_swap(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.apply_no_show_swap(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'NO-SHOW SWAP: apply_no_show_swap is callable by players -- any member could demote a rival by claiming they did not turn up';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Clean up the fixture challenges
-- ---------------------------------------------------------------------------
-- Not tidiness -- this is required for the replay gate to pass, and the reason
-- is worth writing down because nothing about it is local to this file.
--
-- migration-replay-check applies the whole migration set, runs every assert,
-- then applies the whole set AGAIN. 20260807120000 re-adds
-- challenges_cancel_reason_check with its own list, which predates 'no_show':
--
--   CHECK (cancel_reason IS NULL OR cancel_reason IN ('wash','withdrawn','overdue'))
--
-- ADD CONSTRAINT validates existing rows, so a 'no_show' challenge left behind
-- by this file makes that ALTER fail on the second pass -- an assert file
-- breaking a migration written two weeks before the value existed. The rows
-- have served their purpose by here; the fixture re-creates them from scratch
-- on every pass anyway.
--
-- Any future assert that writes a value added by a later migration has the same
-- problem, and the same fix.
DELETE FROM matches WHERE challenge_id IN (
  '00000000-0000-4000-8000-00000000d0c1',
  '00000000-0000-4000-8000-00000000d0c2',
  '00000000-0000-4000-8000-00000000d0c3'
);
DELETE FROM challenges WHERE id IN (
  '00000000-0000-4000-8000-00000000d0c1',
  '00000000-0000-4000-8000-00000000d0c2',
  '00000000-0000-4000-8000-00000000d0c3'
);

DO $$ BEGIN RAISE NOTICE 'NO-SHOW SWAP: ALL CHECKS PASSED'; END $$;
