-- Runtime assertions for 20260822140000_wash_and_return_cooldowns.sql.
--
-- Two rulebook lines the app carried in prose and never enforced:
--
--   "match is a wash challenging player will sit for 24 hrs. The challenged
--    player may challenge up immediately"
--   "When an inactive player renters the list they must either defend or wait
--    7 days ... Exception last player on the list they must wait 24 hrs."
--
-- Both are asymmetric, and the asymmetry is the part worth pinning: a wash sits
-- the CHALLENGER and explicitly frees the challenged player, and the return
-- wait is 7 days for everyone EXCEPT the last player, for whom 7 days would
-- mean no ladder at all. A test that only checked "a cooldown was written"
-- would pass while punishing the wrong person for the wrong length of time.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'WASH AND RETURN COOLDOWNS: ALL CHECKS PASSED' on success.

-- ---------------------------------------------------------------------------
-- A. The wash cooldown sits the challenger only
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  challenger uuid := '00000000-0000-4000-8000-00000000c001';
  challenged uuid := '00000000-0000-4000-8000-00000000c002';
  v_cooldown uuid;
  v_hours    numeric;
  n_challenger integer;
  n_challenged integer;
  failures   text[] := '{}';
BEGIN
  INSERT INTO players (id, full_name, is_active) VALUES
    (challenger, 'Wash Challenger', true),
    (challenged, 'Wash Challenged', true)
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM cooldowns WHERE player_id IN (challenger, challenged);

  v_cooldown := public.apply_wash_cooldown(challenger);

  IF v_cooldown IS NULL THEN
    failures := array_append(failures, 'apply_wash_cooldown returned NULL -- no cooldown was written');
  END IF;

  SELECT count(*) INTO n_challenger FROM cooldowns WHERE player_id = challenger AND type = 'post_wash';
  SELECT count(*) INTO n_challenged FROM cooldowns WHERE player_id = challenged;

  IF n_challenger <> 1 THEN
    failures := array_append(failures,
      format('the challenger has %s post_wash cooldown(s), expected 1', n_challenger));
  END IF;

  -- The half a naive implementation gets wrong.
  IF n_challenged <> 0 THEN
    failures := array_append(failures,
      format('the CHALLENGED player got %s cooldown(s) -- the rulebook lets them challenge up immediately', n_challenged));
  END IF;

  SELECT EXTRACT(EPOCH FROM (expires_at - now())) / 3600 INTO v_hours
    FROM cooldowns WHERE player_id = challenger AND type = 'post_wash';
  IF v_hours IS NULL OR v_hours < 23 OR v_hours > 25 THEN
    failures := array_append(failures,
      format('the wash cooldown expires in %s hours, expected about 24', round(COALESCE(v_hours, 0), 2)));
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'WASH COOLDOWN: % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- B. Returning mid-ladder waits 7 days, and the trigger is what writes it
-- ---------------------------------------------------------------------------
-- Driven by flipping is_active rather than by calling apply_return_cooldown
-- directly, because the trigger is the actual guarantee: an edge function
-- enforces a rule only for callers who use that edge function.
DO $$
DECLARE
  p_mid  uuid := '00000000-0000-4000-8000-00000000c003';
  p_last uuid := '00000000-0000-4000-8000-00000000c004';
  v_base integer;
  v_days numeric;
  n_rows integer;
  failures text[] := '{}';
BEGIN
  INSERT INTO players (id, full_name, is_active) VALUES
    (p_mid,  'Return Midladder', true),
    (p_last, 'Return Lastplace', true)
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM rankings WHERE player_id IN (p_mid, p_last);
  DELETE FROM cooldowns WHERE player_id IN (p_mid, p_last);

  SELECT COALESCE(max(position), 0) INTO v_base FROM rankings;
  -- p_mid sits above p_last, so p_mid is genuinely not last.
  INSERT INTO rankings (player_id, position) VALUES
    (p_mid, v_base + 1), (p_last, v_base + 2);

  -- Out and back. Two statements so each trigger fires on its own transition.
  UPDATE players SET is_active = false WHERE id = p_mid;
  DELETE FROM cooldowns WHERE player_id = p_mid;  -- going inactive writes nothing; prove the return does
  UPDATE players SET is_active = true WHERE id = p_mid;

  SELECT count(*) INTO n_rows FROM cooldowns WHERE player_id = p_mid AND type = 'post_return';
  IF n_rows <> 1 THEN
    failures := array_append(failures,
      format('a returning mid-ladder player has %s post_return cooldown(s), expected 1', n_rows));
  END IF;

  SELECT EXTRACT(EPOCH FROM (expires_at - now())) / 86400 INTO v_days
    FROM cooldowns WHERE player_id = p_mid AND type = 'post_return';
  IF v_days IS NULL OR v_days < 6.9 OR v_days > 7.1 THEN
    failures := array_append(failures,
      format('the return cooldown expires in %s days, expected 7', round(COALESCE(v_days, 0), 3)));
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RETURN COOLDOWN (mid-ladder): % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- C. The last player on the list waits 24 hours, not 7 days
-- ---------------------------------------------------------------------------
-- Without the exception, the bottom of the ladder is frozen out completely:
-- there is nobody below them to challenge down to, so a 7-day block on
-- challenging up is a 7-day block on playing at all.
DO $$
DECLARE
  p_last uuid := '00000000-0000-4000-8000-00000000c004';
  v_hours  numeric;
  v_is_last boolean;
  failures text[] := '{}';
BEGIN
  DELETE FROM cooldowns WHERE player_id = p_last;

  SELECT position = (SELECT max(position) FROM rankings) INTO v_is_last
    FROM rankings WHERE player_id = p_last;
  IF NOT COALESCE(v_is_last, false) THEN
    RAISE EXCEPTION 'WASH AND RETURN COOLDOWNS: fixture is wrong -- p_last is not actually last on the ladder';
  END IF;

  UPDATE players SET is_active = false WHERE id = p_last;
  DELETE FROM cooldowns WHERE player_id = p_last;
  UPDATE players SET is_active = true WHERE id = p_last;

  SELECT EXTRACT(EPOCH FROM (expires_at - now())) / 3600 INTO v_hours
    FROM cooldowns WHERE player_id = p_last AND type = 'post_return';

  IF v_hours IS NULL THEN
    failures := array_append(failures, 'the last player got no return cooldown at all');
  ELSIF v_hours > 25 THEN
    failures := array_append(failures,
      format('the last player waits %s hours, expected about 24 -- the last-place exception did not fire, so the bottom of the ladder is frozen out for a week',
             round(v_hours, 2)));
  ELSIF v_hours < 23 THEN
    failures := array_append(failures,
      format('the last player waits %s hours, expected about 24', round(v_hours, 2)));
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RETURN COOLDOWN (last place): % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- D. Going inactive writes nothing
-- ---------------------------------------------------------------------------
-- The trigger fires on every UPDATE of players. If it wrote on the way out as
-- well as the way in, a member would come back already sitting a cooldown they
-- earned by leaving.
DO $$
DECLARE
  p uuid := '00000000-0000-4000-8000-00000000c003';
  n_rows integer;
BEGIN
  DELETE FROM cooldowns WHERE player_id = p;
  UPDATE players SET is_active = false WHERE id = p;

  SELECT count(*) INTO n_rows FROM cooldowns WHERE player_id = p;
  IF n_rows <> 0 THEN
    RAISE EXCEPTION
      'RETURN COOLDOWN (leaving): going inactive wrote % cooldown row(s); it must write none', n_rows;
  END IF;

  -- Leave the fixture active so replays start from the same place.
  UPDATE players SET is_active = true WHERE id = p;
  DELETE FROM cooldowns WHERE player_id = p;
END $$;

-- ---------------------------------------------------------------------------
-- E. Both helpers stay locked down
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.apply_wash_cooldown(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.apply_wash_cooldown(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'WASH COOLDOWN: apply_wash_cooldown is callable by players -- anyone could sit a rival out';
  END IF;
  IF has_function_privilege('authenticated', 'public.apply_return_cooldown(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.apply_return_cooldown(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RETURN COOLDOWN: apply_return_cooldown is callable by players';
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'WASH AND RETURN COOLDOWNS: ALL CHECKS PASSED'; END $$;
