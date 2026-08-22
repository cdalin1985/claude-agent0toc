-- Runtime assertions for 20260822160000_lock_in_a_challenge_after_defending.sql.
--
--   "If you defend your spot you may challenge up immediately which means you
--    must include a challenge with your results to lock in a challenge if you
--    do not you are open to challenges from behind until you do so."
--
-- Four things decide whether this is the rule or something adjacent to it:
--
--   A. defending grants the right; winning a challenge you ISSUED does not --
--      a top-10 player who challenges down and wins defended nothing
--   B. a locked-in challenge actually shields its challenger from below
--   C. the right lapses when somebody below challenges first, which is the
--      "open to challenges from behind until you do so" half
--   D. an ordinary challenge from a player who never defended is not locked in,
--      and shields nobody
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'LOCK-IN: ALL CHECKS PASSED' on success.

CREATE OR REPLACE FUNCTION pg_temp.seed_lock_in(
  p_top uuid, p_mid uuid, p_low uuid
) RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE
  v_base integer;
BEGIN
  INSERT INTO players (id, full_name, is_active) VALUES
    (p_top, 'Lockin Top',  true),
    (p_mid, 'Lockin Mid',  true),
    (p_low, 'Lockin Low',  true)
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM matches WHERE player1_id IN (p_top, p_mid, p_low) OR player2_id IN (p_top, p_mid, p_low);
  DELETE FROM challenges WHERE challenger_id IN (p_top, p_mid, p_low) OR challenged_id IN (p_top, p_mid, p_low);
  DELETE FROM rankings WHERE player_id IN (p_top, p_mid, p_low);

  SELECT COALESCE(max(position), 0) INTO v_base FROM rankings;
  INSERT INTO rankings (player_id, position) VALUES
    (p_top, v_base + 1), (p_mid, v_base + 2), (p_low, v_base + 3);

  UPDATE players SET lock_in_right = false WHERE id IN (p_top, p_mid, p_low);
  RETURN v_base;
END;
$fn$;

-- Finishes a match in which p_winner beat p_loser on a challenge p_challenger
-- issued against p_challenged, driving the real trigger rather than setting the
-- flag by hand.
CREATE OR REPLACE FUNCTION pg_temp.play_match(
  p_challenge uuid, p_match uuid,
  p_challenger uuid, p_challenged uuid, p_winner uuid, p_loser uuid
) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO challenges (id, challenger_id, challenged_id, discipline, race_length, status, expires_at)
  VALUES (p_challenge, p_challenger, p_challenged, '8 Ball', 7, 'scheduled', now() + INTERVAL '2 days');

  INSERT INTO matches (id, challenge_id, player1_id, player2_id, discipline, race_length, venue, scheduled_at, status)
  VALUES (p_match, p_challenge, p_challenger, p_challenged, '8 Ball', 7, 'Eagles 4040', now(), 'scheduled');

  -- The transition the trigger watches for.
  UPDATE matches
     SET status = 'confirmed', winner_id = p_winner, loser_id = p_loser, completed_at = now()
   WHERE id = p_match;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- A. Defending grants the right; winning your own challenge does not
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p_top uuid := '00000000-0000-4000-8000-00000000e001';
  p_mid uuid := '00000000-0000-4000-8000-00000000e002';
  p_low uuid := '00000000-0000-4000-8000-00000000e003';
  defender_right boolean;
  attacker_right boolean;
  failures text[] := '{}';
BEGIN
  PERFORM pg_temp.seed_lock_in(p_top, p_mid, p_low);

  -- Low challenges Mid; Mid defends and wins.
  PERFORM pg_temp.play_match(
    '00000000-0000-4000-8000-00000000e0a1', '00000000-0000-4000-8000-00000000e0b1',
    p_low, p_mid, p_mid, p_low);
  SELECT lock_in_right INTO defender_right FROM players WHERE id = p_mid;

  -- Top challenges DOWN to Low and wins. Top attacked; nothing was defended.
  PERFORM pg_temp.play_match(
    '00000000-0000-4000-8000-00000000e0a2', '00000000-0000-4000-8000-00000000e0b2',
    p_top, p_low, p_top, p_low);
  SELECT lock_in_right INTO attacker_right FROM players WHERE id = p_top;

  IF NOT COALESCE(defender_right, false) THEN
    failures := array_append(failures, 'a player who defended their spot did not receive the lock-in right');
  END IF;
  IF COALESCE(attacker_right, false) THEN
    failures := array_append(failures,
      'a player who won a challenge they ISSUED received the lock-in right -- challenging down and winning is not defending');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'LOCK-IN (granting): % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- B. A locked-in challenge shields its challenger from below
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p_top uuid := '00000000-0000-4000-8000-00000000e001';
  p_mid uuid := '00000000-0000-4000-8000-00000000e002';
  p_low uuid := '00000000-0000-4000-8000-00000000e003';
  blocked boolean := false;
  failures text[] := '{}';
BEGIN
  PERFORM pg_temp.seed_lock_in(p_top, p_mid, p_low);
  PERFORM pg_temp.play_match(
    '00000000-0000-4000-8000-00000000e0a3', '00000000-0000-4000-8000-00000000e0b3',
    p_low, p_mid, p_mid, p_low);

  -- Mid spends the right: challenges Top, flagged locked_in.
  DELETE FROM challenges WHERE challenger_id = p_mid AND status = 'pending';
  INSERT INTO challenges (id, challenger_id, challenged_id, discipline, race_length, status, expires_at, locked_in)
  VALUES ('00000000-0000-4000-8000-00000000e0a4', p_mid, p_top, '8 Ball', 7, 'pending', now() + INTERVAL '2 days', true);
  UPDATE players SET lock_in_right = false WHERE id = p_mid;

  -- Low now tries to challenge Mid from behind.
  BEGIN
    INSERT INTO challenges (id, challenger_id, challenged_id, discipline, race_length, status, expires_at)
    VALUES ('00000000-0000-4000-8000-00000000e0a5', p_low, p_mid, '8 Ball', 7, 'pending', now() + INTERVAL '2 days');
  EXCEPTION WHEN check_violation THEN
    blocked := true;
  END;

  IF NOT blocked THEN
    failures := array_append(failures,
      'a player who locked in a challenge was still challengeable from behind -- the lock-in shield did nothing');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'LOCK-IN (shield): % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- C. Being challenged first lapses the right
-- ---------------------------------------------------------------------------
-- The other half of the sentence. A defender who sits on the opportunity loses
-- it to the first player behind them who acts.
DO $$
DECLARE
  p_top uuid := '00000000-0000-4000-8000-00000000e001';
  p_mid uuid := '00000000-0000-4000-8000-00000000e002';
  p_low uuid := '00000000-0000-4000-8000-00000000e003';
  right_before boolean;
  right_after  boolean;
  failures text[] := '{}';
BEGIN
  PERFORM pg_temp.seed_lock_in(p_top, p_mid, p_low);
  PERFORM pg_temp.play_match(
    '00000000-0000-4000-8000-00000000e0a6', '00000000-0000-4000-8000-00000000e0b6',
    p_low, p_mid, p_mid, p_low);
  SELECT lock_in_right INTO right_before FROM players WHERE id = p_mid;

  -- Mid does NOT lock anything in. Low challenges them.
  --
  -- The just-played challenge is still 'scheduled' (only matches.status
  -- advances), so it would trip idx_challenges_one_active_per_challenged and
  -- this scenario would prove nothing. Clearing it needs the match gone first --
  -- matches.challenge_id is a FK with no cascade.
  DELETE FROM matches WHERE challenge_id IN (
    SELECT id FROM challenges WHERE challenged_id = p_mid AND status IN ('pending','accepted','scheduled','in_progress')
  );
  DELETE FROM challenges WHERE challenged_id = p_mid AND status IN ('pending','accepted','scheduled','in_progress');
  INSERT INTO challenges (id, challenger_id, challenged_id, discipline, race_length, status, expires_at)
  VALUES ('00000000-0000-4000-8000-00000000e0a7', p_low, p_mid, '8 Ball', 7, 'pending', now() + INTERVAL '2 days');

  SELECT lock_in_right INTO right_after FROM players WHERE id = p_mid;

  IF NOT COALESCE(right_before, false) THEN
    failures := array_append(failures, 'the defender never held the right, so this scenario proved nothing');
  END IF;
  IF COALESCE(right_after, false) THEN
    failures := array_append(failures,
      'the defender kept the lock-in right after being challenged from behind -- they were open to challenges and lost the opening');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'LOCK-IN (lapsing): % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- C2. A challenge from ABOVE does not lapse the right
-- ---------------------------------------------------------------------------
-- "you are open to challenges from behind until you do so" -- from behind,
-- specifically. A top-10 player may challenge DOWN, so a defender can be
-- challenged by somebody above them, and that is not the case the rule
-- describes. Lapsing on any incoming challenge takes away an opening the
-- rulebook never said they had lost.
DO $$
DECLARE
  p_top uuid := '00000000-0000-4000-8000-00000000e001';
  p_mid uuid := '00000000-0000-4000-8000-00000000e002';
  p_low uuid := '00000000-0000-4000-8000-00000000e003';
  right_before boolean;
  right_after  boolean;
  failures text[] := '{}';
BEGIN
  PERFORM pg_temp.seed_lock_in(p_top, p_mid, p_low);
  -- Low challenges Mid; Mid defends and wins, earning the right.
  PERFORM pg_temp.play_match(
    '00000000-0000-4000-8000-00000000e0aa', '00000000-0000-4000-8000-00000000e0ba',
    p_low, p_mid, p_mid, p_low);
  SELECT lock_in_right INTO right_before FROM players WHERE id = p_mid;

  -- Clear the played challenge so the one-live-challenge index does not mask
  -- the behaviour under test. Matches first: the FK has no cascade.
  DELETE FROM matches WHERE challenge_id IN (
    SELECT id FROM challenges WHERE challenged_id = p_mid AND status IN ('pending','accepted','scheduled','in_progress')
  );
  DELETE FROM challenges WHERE challenged_id = p_mid AND status IN ('pending','accepted','scheduled','in_progress');

  -- Top, who is ABOVE Mid, challenges down at them.
  INSERT INTO challenges (id, challenger_id, challenged_id, discipline, race_length, status, expires_at)
  VALUES ('00000000-0000-4000-8000-00000000e0ab', p_top, p_mid, '8 Ball', 7, 'pending', now() + INTERVAL '2 days');

  SELECT lock_in_right INTO right_after FROM players WHERE id = p_mid;

  IF NOT COALESCE(right_before, false) THEN
    failures := array_append(failures, 'the defender never held the right, so this scenario proved nothing');
  END IF;
  IF NOT COALESCE(right_after, false) THEN
    failures := array_append(failures,
      'a challenge from ABOVE lapsed the defender''s lock-in right -- the rule only opens them to challenges from BEHIND');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'LOCK-IN (challenged from above): % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- D. An ordinary challenge shields nobody
-- ---------------------------------------------------------------------------
-- Without this, "everyone with an outgoing challenge is immune" would pass every
-- check above while being a completely different rule.
DO $$
DECLARE
  p_top uuid := '00000000-0000-4000-8000-00000000e001';
  p_mid uuid := '00000000-0000-4000-8000-00000000e002';
  p_low uuid := '00000000-0000-4000-8000-00000000e003';
  blocked boolean := false;
BEGIN
  PERFORM pg_temp.seed_lock_in(p_top, p_mid, p_low);

  -- Mid has never defended, and challenges Top the ordinary way.
  INSERT INTO challenges (id, challenger_id, challenged_id, discipline, race_length, status, expires_at)
  VALUES ('00000000-0000-4000-8000-00000000e0a8', p_mid, p_top, '8 Ball', 7, 'pending', now() + INTERVAL '2 days');

  BEGIN
    INSERT INTO challenges (id, challenger_id, challenged_id, discipline, race_length, status, expires_at)
    VALUES ('00000000-0000-4000-8000-00000000e0a9', p_low, p_mid, '8 Ball', 7, 'pending', now() + INTERVAL '2 days');
  EXCEPTION WHEN check_violation THEN
    blocked := true;
  END;

  IF blocked THEN
    RAISE EXCEPTION
      'LOCK-IN (ordinary challenge): an unlocked outgoing challenge shielded its challenger -- that is a different rule, and it would let anyone stay permanently unchallengeable';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------
-- Same reason as 13_: the replay gate re-applies migrations dated 20260807 or
-- later after the asserts run, and leftover fixture rows must not violate a
-- constraint one of them re-adds.
DELETE FROM matches WHERE player1_id IN (
  '00000000-0000-4000-8000-00000000e001','00000000-0000-4000-8000-00000000e002','00000000-0000-4000-8000-00000000e003'
) OR player2_id IN (
  '00000000-0000-4000-8000-00000000e001','00000000-0000-4000-8000-00000000e002','00000000-0000-4000-8000-00000000e003'
);
DELETE FROM challenges WHERE challenger_id IN (
  '00000000-0000-4000-8000-00000000e001','00000000-0000-4000-8000-00000000e002','00000000-0000-4000-8000-00000000e003'
) OR challenged_id IN (
  '00000000-0000-4000-8000-00000000e001','00000000-0000-4000-8000-00000000e002','00000000-0000-4000-8000-00000000e003'
);

DO $$ BEGIN RAISE NOTICE 'LOCK-IN: ALL CHECKS PASSED'; END $$;
