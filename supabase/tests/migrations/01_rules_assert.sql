-- Runtime assertions for the time-based league rules.
--
-- The .mjs suite asserts on source TEXT -- it pins intent but cannot prove the
-- SQL runs, let alone that it does the right thing. These execute the functions
-- against a real database and raise (psql exits non-zero, failing CI) on any
-- wrong answer. Prints 'LEAGUE RULES: ALL CHECKS PASSED' on success.
--
-- Run after replaying supabase/tests/migrations/00_supabase_shim.sql and the
-- full supabase/migrations set.

DO $$
DECLARE
  p_top    uuid;  -- #1
  p_mid    uuid;  -- #2
  p_low    uuid;  -- #3
  p_other  uuid;  -- #4
  c_over   uuid;
  c_played uuid;
  c_nomatch uuid;
  m_over   uuid;
  m_played uuid;
  m_soon   uuid;
  m_far    uuid;
  ids      uuid[];
  n        integer;
  base     integer;
  failures text[] := '{}';
BEGIN
  -- ---------------------------------------------------------------- seed ---
  -- 20260321032616_toc_seed_data.sql already populates the real roster, and
  -- rankings.position is unique, so these fixtures go on the end of the list.
  SELECT COALESCE(MAX(position), 0) INTO base FROM rankings;

  INSERT INTO players (full_name) VALUES ('Top Player')  RETURNING id INTO p_top;
  INSERT INTO players (full_name) VALUES ('Mid Player')  RETURNING id INTO p_mid;
  INSERT INTO players (full_name) VALUES ('Low Player')  RETURNING id INTO p_low;
  INSERT INTO players (full_name) VALUES ('Other Player') RETURNING id INTO p_other;

  INSERT INTO rankings (player_id, position)
  VALUES (p_top, base + 1), (p_mid, base + 2), (p_low, base + 3), (p_other, base + 4);

  UPDATE league_settings SET cooldown_hours = 24, match_play_days = 10;

  -- ------------------------------------------- apply_post_match_cooldowns ---
  -- Loser only (a successful defence): exactly one cooldown, for the loser.
  ids := public.apply_post_match_cooldowns(p_low, NULL);
  IF ids[1] IS NULL THEN failures := array_append(failures, 'defence: loser got no cooldown'); END IF;
  IF ids[2] IS NOT NULL THEN failures := array_append(failures, 'defence: a climber cooldown was written'); END IF;
  SELECT count(*) INTO n FROM cooldowns WHERE player_id = p_low AND type = 'post_match' AND expires_at > now();
  IF n <> 1 THEN failures := array_append(failures, format('defence: expected 1 loser cooldown, got %s', n)); END IF;

  -- Loser + climber: two cooldowns, one each.
  ids := public.apply_post_match_cooldowns(p_mid, p_other);
  IF ids[1] IS NULL OR ids[2] IS NULL THEN failures := array_append(failures, 'climb: expected both cooldowns'); END IF;
  SELECT count(*) INTO n FROM cooldowns WHERE player_id = p_other AND type = 'post_match' AND expires_at > now();
  IF n <> 1 THEN failures := array_append(failures, format('climb: expected 1 climber cooldown, got %s', n)); END IF;

  -- Same player passed twice must not produce two rows for one person.
  DELETE FROM cooldowns;
  ids := public.apply_post_match_cooldowns(p_top, p_top);
  SELECT count(*) INTO n FROM cooldowns WHERE player_id = p_top;
  IF n <> 1 THEN failures := array_append(failures, format('self-pair: expected 1 cooldown, got %s', n)); END IF;

  -- cooldown_hours = 0 disables the rule entirely.
  DELETE FROM cooldowns;
  UPDATE league_settings SET cooldown_hours = 0;
  ids := public.apply_post_match_cooldowns(p_low, p_mid);
  SELECT count(*) INTO n FROM cooldowns;
  IF n <> 0 THEN failures := array_append(failures, format('cooldown_hours=0 still wrote %s rows', n)); END IF;
  IF ids[1] IS NOT NULL OR ids[2] IS NOT NULL THEN failures := array_append(failures, 'cooldown_hours=0 returned ids'); END IF;
  UPDATE league_settings SET cooldown_hours = 24;
  DELETE FROM cooldowns;

  -- ------------------------------------------------ expire_overdue_matches ---
  -- (a) past deadline, match never started  -> ruled a wash
  INSERT INTO challenges (challenger_id, challenged_id, discipline, race_length, status, expires_at, match_deadline)
  VALUES (p_low, p_mid, '8 Ball', 7, 'scheduled', now() + interval '30 days', now() - interval '1 day')
  RETURNING id INTO c_over;
  INSERT INTO matches (challenge_id, player1_id, player2_id, discipline, race_length, venue, scheduled_at, status)
  VALUES (c_over, p_low, p_mid, '8 Ball', 7, 'Eagles 4040', now() - interval '3 days', 'scheduled')
  RETURNING id INTO m_over;

  -- (b) past deadline, but the match was actually played -> must NOT be touched
  INSERT INTO challenges (challenger_id, challenged_id, discipline, race_length, status, expires_at, match_deadline)
  VALUES (p_top, p_other, '9 Ball', 7, 'scheduled', now() + interval '30 days', now() - interval '1 day')
  RETURNING id INTO c_played;
  INSERT INTO matches (challenge_id, player1_id, player2_id, discipline, race_length, venue, scheduled_at, status)
  VALUES (c_played, p_top, p_other, '9 Ball', 7, 'Valley Hub', now() - interval '3 days', 'submitted')
  RETURNING id INTO m_played;

  -- (c) past deadline, no match row at all (accept died mid-way) -> ruled a wash
  INSERT INTO challenges (challenger_id, challenged_id, discipline, race_length, status, expires_at, match_deadline)
  VALUES (p_mid, p_other, '10 Ball', 7, 'scheduled', now() + interval '30 days', now() - interval '2 days')
  RETURNING id INTO c_nomatch;

  n := public.expire_overdue_matches();
  IF n <> 2 THEN failures := array_append(failures, format('expire: expected 2 challenges expired, got %s', n)); END IF;

  IF (SELECT status FROM challenges WHERE id = c_over) <> 'cancelled'
     OR (SELECT cancel_reason FROM challenges WHERE id = c_over) <> 'overdue' THEN
    failures := array_append(failures, 'expire: unplayed challenge was not ruled a wash');
  END IF;
  IF (SELECT status FROM matches WHERE id = m_over) <> 'resolved' THEN
    failures := array_append(failures, 'expire: unplayed match was not closed');
  END IF;

  -- The critical one: a played match must survive an expired deadline.
  IF (SELECT status FROM challenges WHERE id = c_played) <> 'scheduled' THEN
    failures := array_append(failures, 'expire: a PLAYED match was cancelled -- result destroyed');
  END IF;
  IF (SELECT status FROM matches WHERE id = m_played) <> 'submitted' THEN
    failures := array_append(failures, 'expire: a submitted match was overwritten');
  END IF;

  IF (SELECT cancel_reason FROM challenges WHERE id = c_nomatch) <> 'overdue' THEN
    failures := array_append(failures, 'expire: challenge stranded with no match row was not cleared');
  END IF;

  -- Both players told, on each expired challenge.
  SELECT count(*) INTO n FROM notifications WHERE reference_id = c_over AND type = 'challenge_expired';
  IF n <> 2 THEN failures := array_append(failures, format('expire: expected 2 notifications, got %s', n)); END IF;
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE reference_id = c_over AND body LIKE '%Mid Player%') THEN
    failures := array_append(failures, 'expire: notification does not name the opponent');
  END IF;

  -- Idempotent: a second run must find nothing.
  n := public.expire_overdue_matches();
  IF n <> 0 THEN failures := array_append(failures, format('expire: re-run affected %s rows, expected 0', n)); END IF;

  -- ------------------------------------------------------------- privileges ---
  IF has_function_privilege('authenticated', 'public.apply_post_match_cooldowns(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.apply_post_match_cooldowns(uuid, uuid)', 'EXECUTE') THEN
    failures := array_append(failures, 'apply_post_match_cooldowns is callable by a player role');
  END IF;
  IF has_function_privilege('authenticated', 'public.expire_overdue_matches()', 'EXECUTE') THEN
    failures := array_append(failures, 'a scheduled job function is callable by a player role');
  END IF;
  IF NOT has_function_privilege('service_role', 'public.apply_post_match_cooldowns(uuid, uuid)', 'EXECUTE') THEN
    failures := array_append(failures, 'service_role cannot call apply_post_match_cooldowns');
  END IF;

  -- ----------------------------------------------------------------- report ---
  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'LEAGUE RULES: % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;

  RAISE NOTICE 'LEAGUE RULES: ALL CHECKS PASSED';
END $$;
