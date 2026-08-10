-- Runtime assertions for venue stats, profile customization and feature toggles.
--
-- The toggles are the reason this file matters. "Stores a flag" and "the flag
-- does something" are different claims, and only the second one is worth
-- anything to a player who switched notifications off. These prove the second.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'PREFERENCES: ALL CHECKS PASSED' on success.

DO $$
DECLARE
  p_win    uuid;
  p_lose   uuid;
  c_id     uuid;
  m_id     uuid;
  base     integer;
  n        integer;
  ok       boolean;
  failures text[] := '{}';
BEGIN
  SELECT COALESCE(MAX(position), 0) INTO base FROM rankings;
  INSERT INTO players (full_name) VALUES ('Venue Winner') RETURNING id INTO p_win;
  INSERT INTO players (full_name) VALUES ('Venue Loser')  RETURNING id INTO p_lose;
  INSERT INTO rankings (player_id, position) VALUES (p_win, base + 1), (p_lose, base + 2);

  -- ------------------------------------------------ preferences auto-create ---
  -- Every player must get a row without anyone remembering to make one.
  SELECT count(*) INTO n FROM player_preferences WHERE player_id IN (p_win, p_lose);
  IF n <> 2 THEN failures := array_append(failures, format('expected preferences rows for new players, got %s', n)); END IF;

  -- And the seeded roster was backfilled, not just new players.
  SELECT count(*) INTO n FROM players p
   WHERE NOT EXISTS (SELECT 1 FROM player_preferences pp WHERE pp.player_id = p.id);
  IF n <> 0 THEN failures := array_append(failures, format('%s players have no preferences row', n)); END IF;

  -- ----------------------------------------------------- toggles actually bite ---
  DELETE FROM notifications WHERE player_id = p_win;

  -- Default on: an optional notification is delivered.
  INSERT INTO notifications (player_id, type, title, body)
  VALUES (p_win, 'challenge_received', 't', 'b');
  SELECT count(*) INTO n FROM notifications WHERE player_id = p_win AND type = 'challenge_received';
  IF n <> 1 THEN failures := array_append(failures, 'a challenge notification was dropped while the toggle was ON'); END IF;

  -- Switched off: the same notification must not land.
  UPDATE player_preferences SET notify_challenges = FALSE WHERE player_id = p_win;
  INSERT INTO notifications (player_id, type, title, body)
  VALUES (p_win, 'challenge_received', 't2', 'b2');
  SELECT count(*) INTO n FROM notifications WHERE player_id = p_win AND type = 'challenge_received';
  IF n <> 1 THEN
    failures := array_append(failures, 'turning challenges off did not stop a challenge notification');
  END IF;

  -- Categories are independent: turning challenges off must not mute reminders.
  INSERT INTO notifications (player_id, type, title, body)
  VALUES (p_win, 'match_reminder', 't', 'b');
  SELECT count(*) INTO n FROM notifications WHERE player_id = p_win AND type = 'match_reminder';
  IF n <> 1 THEN failures := array_append(failures, 'turning challenges off also muted reminders'); END IF;

  UPDATE player_preferences SET notify_reminders = FALSE WHERE player_id = p_win;
  INSERT INTO notifications (player_id, type, title, body)
  VALUES (p_win, 'match_reminder', 't2', 'b2');
  SELECT count(*) INTO n FROM notifications WHERE player_id = p_win AND type = 'match_reminder';
  IF n <> 1 THEN failures := array_append(failures, 'turning reminders off did not stop a reminder'); END IF;

  -- Consequences cannot be switched off. Everything is muted at this point.
  UPDATE player_preferences
     SET notify_challenges = FALSE, notify_reminders = FALSE,
         notify_results = FALSE, notify_activity = FALSE, push_enabled = FALSE
   WHERE player_id = p_win;

  INSERT INTO notifications (player_id, type, title, body)
  VALUES (p_win, 'rank1_penalty', 'demoted', 'you were moved to #10');
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE player_id = p_win AND type = 'rank1_penalty') THEN
    failures := array_append(failures, 'a rank-1 penalty was suppressed by a preference');
  END IF;

  INSERT INTO notifications (player_id, type, title, body)
  VALUES (p_win, 'result_disputed', 'disputed', 'your result is disputed');
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE player_id = p_win AND type = 'result_disputed') THEN
    failures := array_append(failures, 'a dispute notification was suppressed by a preference');
  END IF;

  INSERT INTO notifications (player_id, type, title, body)
  VALUES (p_win, 'challenge_forfeit_win', 'forfeit', 'they declined');
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE player_id = p_win AND type = 'challenge_forfeit_win') THEN
    failures := array_append(failures, 'a forfeit notification was suppressed by a preference');
  END IF;

  -- An unknown type must default to delivering, not to silence.
  INSERT INTO notifications (player_id, type, title, body)
  VALUES (p_win, 'some_future_type', 'new', 'added years from now');
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE player_id = p_win AND type = 'some_future_type') THEN
    failures := array_append(failures, 'an unmapped notification type defaulted to silence');
  END IF;

  -- A player with no preferences row at all must still be reachable.
  DELETE FROM player_preferences WHERE player_id = p_lose;
  INSERT INTO notifications (player_id, type, title, body)
  VALUES (p_lose, 'challenge_received', 't', 'b');
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE player_id = p_lose AND type = 'challenge_received') THEN
    failures := array_append(failures, 'a player with no preferences row was silenced');
  END IF;
  INSERT INTO player_preferences (player_id) VALUES (p_lose) ON CONFLICT DO NOTHING;

  -- The helper the edge functions call must agree with the trigger.
  UPDATE player_preferences SET notify_challenges = FALSE WHERE player_id = p_win;
  SELECT public.player_accepts_notification(p_win, 'challenge_received') INTO ok;
  IF ok THEN failures := array_append(failures, 'player_accepts_notification disagrees with the trigger'); END IF;
  SELECT public.player_accepts_notification(p_win, 'rank1_penalty') INTO ok;
  IF NOT ok THEN failures := array_append(failures, 'player_accepts_notification suppressed a mandatory type'); END IF;

  -- ------------------------------------------------------------- venue stats ---
  -- Backfill ran over the seeded history without inventing rows.
  IF EXISTS (SELECT 1 FROM player_venue_stats WHERE matches_played = 0) THEN
    failures := array_append(failures, 'backfill produced venue rows with no matches');
  END IF;
  IF EXISTS (SELECT 1 FROM player_venue_stats WHERE wins + losses <> matches_played) THEN
    failures := array_append(failures, 'venue stats wins+losses do not equal matches_played');
  END IF;
  IF EXISTS (SELECT 1 FROM player_venue_stats WHERE current_streak > best_streak) THEN
    failures := array_append(failures, 'venue stats current_streak exceeds best_streak');
  END IF;
  IF EXISTS (SELECT 1 FROM player_venue_stats WHERE challenger_wins + defender_wins <> wins) THEN
    failures := array_append(failures, 'venue stats challenger+defender wins do not equal wins');
  END IF;

  -- Venue totals must reconcile with the match history they came from.
  SELECT count(*) INTO n
  FROM (
    SELECT p.player_id, m.venue, count(*) AS played
      FROM matches m
      CROSS JOIN LATERAL (VALUES (m.player1_id), (m.player2_id)) AS p(player_id)
     WHERE m.status IN ('confirmed', 'resolved') AND m.winner_id IS NOT NULL AND m.venue IS NOT NULL
     GROUP BY p.player_id, m.venue
  ) expected
  LEFT JOIN player_venue_stats s
    ON s.player_id = expected.player_id AND s.venue = expected.venue
  WHERE s.matches_played IS DISTINCT FROM expected.played;
  IF n <> 0 THEN failures := array_append(failures, format('%s venue rows disagree with the match history', n)); END IF;

  -- ------------------------------------------------------ profile guard rails ---
  BEGIN
    UPDATE players SET accent_color = '#123456' WHERE id = p_win;
    failures := array_append(failures, 'an off-palette accent_color was accepted');
  EXCEPTION WHEN check_violation THEN NULL;  -- expected: palette CHECK from 20260807010000
  END;
  BEGIN
    UPDATE players SET accent_color = '#C62828' WHERE id = p_win;
  EXCEPTION WHEN others THEN
    failures := array_append(failures, 'a valid accent_color was rejected: ' || SQLERRM);
  END;
  BEGIN
    UPDATE players SET nickname = repeat('x', 25) WHERE id = p_win;
    failures := array_append(failures, 'an over-long nickname was accepted');
  EXCEPTION WHEN check_violation THEN NULL;  -- expected
  END;
  BEGIN
    UPDATE players SET years_playing = 200 WHERE id = p_win;
    failures := array_append(failures, 'an impossible years_playing was accepted');
  EXCEPTION WHEN check_violation THEN NULL;  -- expected
  END;

  -- ------------------------------------------------------------- privileges ---
  -- Cosmetic columns are self-editable; privileged ones must stay closed.
  IF NOT has_column_privilege('authenticated', 'public.players', 'nickname', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.players', 'accent_color', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.players', 'home_venue', 'UPDATE') THEN
    failures := array_append(failures, 'players cannot edit their own profile fields');
  END IF;

  IF has_table_privilege('authenticated', 'public.player_venue_stats', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.player_venue_stats', 'INSERT') THEN
    failures := array_append(failures, 'players can write their own venue stats');
  END IF;

  IF has_table_privilege('authenticated', 'public.player_preferences', 'INSERT')
     OR has_table_privilege('authenticated', 'public.player_preferences', 'DELETE') THEN
    failures := array_append(failures, 'players can create or delete preference rows');
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.player_preferences', 'notify_challenges', 'UPDATE') THEN
    failures := array_append(failures, 'players cannot change their own notification settings');
  END IF;

  IF has_function_privilege('anon', 'public.player_accepts_notification(uuid, text)', 'EXECUTE') THEN
    failures := array_append(failures, 'player_accepts_notification is callable anonymously');
  END IF;

  -- ----------------------------------------------------------------- report ---
  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'PREFERENCES: % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;

  RAISE NOTICE 'PREFERENCES: ALL CHECKS PASSED';
END $$;
