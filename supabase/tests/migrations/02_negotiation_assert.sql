-- Runtime assertions for scheduling negotiation.
--
-- Turn order is enforced in the edge function, but it is only SAFE because the
-- database guarantees at most one live proposal per challenge. These prove the
-- guarantees the function is entitled to rely on, plus the expiry change that
-- stops negotiation being used to keep a challenge alive forever.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'NEGOTIATION: ALL CHECKS PASSED' on success.

DO $$
DECLARE
  p_a      uuid;
  p_b      uuid;
  c_live   uuid;
  c_stale  uuid;
  prop_a   uuid;
  base     integer;
  n        integer;
  failures text[] := '{}';
BEGIN
  SELECT COALESCE(MAX(position), 0) INTO base FROM rankings;
  INSERT INTO players (full_name) VALUES ('Negotiator A') RETURNING id INTO p_a;
  INSERT INTO players (full_name) VALUES ('Negotiator B') RETURNING id INTO p_b;
  INSERT INTO rankings (player_id, position) VALUES (p_a, base + 1), (p_b, base + 2);

  INSERT INTO challenges (challenger_id, challenged_id, discipline, race_length, status, expires_at)
  VALUES (p_a, p_b, '8 Ball', 7, 'accepted', now() + interval '5 days')
  RETURNING id INTO c_live;

  -- ------------------------------------------------ one live proposal only ---
  INSERT INTO challenge_proposals (challenge_id, proposed_by_player_id, venue, scheduled_at)
  VALUES (c_live, p_b, 'Eagles 4040', now() + interval '2 days')
  RETURNING id INTO prop_a;

  -- A second pending row on the same challenge must be impossible. This is what
  -- makes "whose turn is it" answerable at all.
  BEGIN
    INSERT INTO challenge_proposals (challenge_id, proposed_by_player_id, venue, scheduled_at)
    VALUES (c_live, p_a, 'Valley Hub', now() + interval '3 days');
    failures := array_append(failures, 'two pending proposals were allowed on one challenge');
  EXCEPTION WHEN unique_violation THEN NULL;  -- expected
  END;

  -- Superseding the first frees the slot, which is exactly how a counter works.
  UPDATE challenge_proposals SET status = 'superseded', responded_at = now() WHERE id = prop_a;
  BEGIN
    INSERT INTO challenge_proposals (challenge_id, proposed_by_player_id, venue, scheduled_at)
    VALUES (c_live, p_a, 'Valley Hub', now() + interval '3 days');
  EXCEPTION WHEN others THEN
    failures := array_append(failures, 'could not counter after superseding: ' || SQLERRM);
  END;

  -- Many superseded rows may coexist -- the negotiation history is kept.
  SELECT count(*) INTO n FROM challenge_proposals WHERE challenge_id = c_live;
  IF n <> 2 THEN failures := array_append(failures, format('expected 2 proposal rows kept, got %s', n)); END IF;

  -- An unknown status must be rejected.
  BEGIN
    INSERT INTO challenge_proposals (challenge_id, proposed_by_player_id, venue, scheduled_at, status)
    VALUES (c_live, p_b, 'Eagles 4040', now() + interval '4 days', 'maybe');
    failures := array_append(failures, 'an invalid proposal status was accepted');
  EXCEPTION WHEN check_violation THEN NULL;  -- expected
  END;

  -- --------------------------------------------- negotiation cannot outlive ---
  -- A challenge being scheduled, past its response deadline, must expire.
  INSERT INTO challenges (challenger_id, challenged_id, discipline, race_length, status, expires_at)
  VALUES (p_b, p_a, '9 Ball', 7, 'accepted', now() - interval '1 hour')
  RETURNING id INTO c_stale;
  INSERT INTO challenge_proposals (challenge_id, proposed_by_player_id, venue, scheduled_at)
  VALUES (c_stale, p_a, 'Eagles 4040', now() + interval '2 days');

  n := public.expire_stale_challenges();
  IF n < 1 THEN failures := array_append(failures, 'expire_stale_challenges did not expire a stale negotiation'); END IF;
  IF (SELECT status FROM challenges WHERE id = c_stale) <> 'expired' THEN
    failures := array_append(failures, 'a negotiating challenge past its deadline was not expired');
  END IF;
  -- Its live proposal must be closed out, not left dangling as pending.
  IF EXISTS (SELECT 1 FROM challenge_proposals WHERE challenge_id = c_stale AND status = 'pending') THEN
    failures := array_append(failures, 'an expired challenge kept a pending proposal');
  END IF;

  -- A negotiation still inside its deadline must be left alone.
  IF (SELECT status FROM challenges WHERE id = c_live) <> 'accepted' THEN
    failures := array_append(failures, 'a live negotiation was expired early');
  END IF;

  -- Idempotent.
  n := public.expire_stale_challenges();
  IF (SELECT status FROM challenges WHERE id = c_live) <> 'accepted' THEN
    failures := array_append(failures, 're-running expiry expired a live negotiation');
  END IF;

  -- ------------------------------------------------------------- privileges ---
  -- Proposals are public to logged-in members but written only by the edge
  -- function; a player must not be able to insert one directly.
  IF NOT has_table_privilege('authenticated', 'public.challenge_proposals', 'SELECT') THEN
    failures := array_append(failures, 'players cannot read the negotiation log');
  END IF;
  IF has_table_privilege('authenticated', 'public.challenge_proposals', 'INSERT')
     OR has_table_privilege('authenticated', 'public.challenge_proposals', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.challenge_proposals', 'DELETE') THEN
    failures := array_append(failures, 'players can write proposals directly, bypassing turn order');
  END IF;
  IF NOT has_table_privilege('service_role', 'public.challenge_proposals', 'INSERT') THEN
    failures := array_append(failures, 'service_role cannot write proposals');
  END IF;
  IF has_function_privilege('authenticated', 'public.expire_stale_challenges()', 'EXECUTE') THEN
    failures := array_append(failures, 'expire_stale_challenges is callable by a player role');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'challenge_proposals' AND relrowsecurity
  ) THEN
    failures := array_append(failures, 'RLS is not enabled on challenge_proposals');
  END IF;

  -- ----------------------------------------------------------------- report ---
  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'NEGOTIATION: % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;

  RAISE NOTICE 'NEGOTIATION: ALL CHECKS PASSED';
END $$;
