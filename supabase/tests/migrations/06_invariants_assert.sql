-- Runtime assertions for the invariants moved into the database by
-- 20260812050000_enforce_invariants_in_the_database.sql.
--
-- These are deliberately BEHAVIOURAL: each rule is exercised by actually
-- attempting the thing it forbids and requiring the write to fail. Every one of
-- them was previously "enforced" by application code that a passing regex test
-- claimed to cover, so asserting on privileges alone would repeat that mistake.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'INVARIANTS: ALL CHECKS PASSED' on success.

DO $$
DECLARE
  p_one    uuid;
  p_two    uuid;
  p_three  uuid;
  c_first  uuid;
  c_done   uuid;
  base     integer;
  blocked  boolean;
  failures text[] := '{}';
BEGIN
  SELECT COALESCE(MAX(position), 0) INTO base FROM rankings;
  INSERT INTO players (full_name) VALUES ('Invariant One')   RETURNING id INTO p_one;
  INSERT INTO players (full_name) VALUES ('Invariant Two')   RETURNING id INTO p_two;
  INSERT INTO players (full_name) VALUES ('Invariant Three') RETURNING id INTO p_three;
  INSERT INTO rankings (player_id, position)
  VALUES (p_one, base + 1), (p_two, base + 2), (p_three, base + 3);

  -- ------------------------------------------------- identity is not yours ---
  -- A player could rename themselves on the public ladder: the column-level
  -- GRANT was a no-op under Supabase's default table-level grant, and the guard
  -- trigger pinned is_active but not full_name.
  IF has_column_privilege('authenticated', 'public.players', 'full_name', 'UPDATE') THEN
    failures := array_append(failures, 'authenticated can still UPDATE players.full_name');
  END IF;
  IF has_column_privilege('authenticated', 'public.players', 'profile_id', 'UPDATE') THEN
    failures := array_append(failures, 'authenticated can still UPDATE players.profile_id');
  END IF;
  IF has_column_privilege('authenticated', 'public.players', 'is_active', 'UPDATE') THEN
    failures := array_append(failures, 'authenticated can still UPDATE players.is_active');
  END IF;

  -- ...but the cosmetic columns the app actually writes must keep working, or
  -- the REVOKE above silently breaks profile editing for every player.
  IF NOT has_column_privilege('authenticated', 'public.players', 'bio', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.players', 'avatar_url', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.players', 'banner_url', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.players', 'accent_color', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.players', 'preferred_discipline', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.players', 'nickname', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.players', 'tagline', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.players', 'home_venue', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.players', 'years_playing', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.players', 'cue_brand', 'UPDATE') THEN
    failures := array_append(failures, 'a cosmetic profile column lost its UPDATE grant -- profile editing is broken');
  END IF;

  -- The trigger is the second half: it must refuse even a service-path rename
  -- attempted under a player JWT, regardless of grants.
  BEGIN
    blocked := false;
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    UPDATE players SET full_name = 'Renamed By Themselves' WHERE id = p_one;
    PERFORM set_config('request.jwt.claims', NULL, true);
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
    PERFORM set_config('request.jwt.claims', NULL, true);
  END;
  IF NOT blocked THEN
    failures := array_append(failures, 'guard_privilege_columns let a player change full_name');
  END IF;

  -- ------------------------------------------ one live challenge per player ---
  INSERT INTO challenges (challenger_id, challenged_id, discipline, race_length, status, expires_at)
  VALUES (p_one, p_two, '8 Ball', 7, 'pending', now() + interval '5 days')
  RETURNING id INTO c_first;

  -- Same challenger, second live challenge.
  BEGIN
    blocked := false;
    INSERT INTO challenges (challenger_id, challenged_id, discipline, race_length, status, expires_at)
    VALUES (p_one, p_three, '9 Ball', 7, 'pending', now() + interval '5 days');
  EXCEPTION WHEN unique_violation THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    failures := array_append(failures, 'a player can hold two live outgoing challenges');
  END IF;

  -- Same challenged player, second live challenge.
  BEGIN
    blocked := false;
    INSERT INTO challenges (challenger_id, challenged_id, discipline, race_length, status, expires_at)
    VALUES (p_three, p_two, '9 Ball', 7, 'pending', now() + interval '5 days');
  EXCEPTION WHEN unique_violation THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    failures := array_append(failures, 'a player can be the target of two live challenges');
  END IF;

  -- A settled challenge must NOT constrain a fresh one, or a player could never
  -- challenge again after their first match.
  UPDATE challenges SET status = 'cancelled', cancel_reason = 'wash' WHERE id = c_first;
  BEGIN
    INSERT INTO challenges (challenger_id, challenged_id, discipline, race_length, status, expires_at)
    VALUES (p_one, p_two, '8 Ball', 7, 'pending', now() + interval '5 days')
    RETURNING id INTO c_done;
  EXCEPTION WHEN unique_violation THEN
    failures := array_append(failures, 'the partial index is constraining settled challenges, not just live ones');
  END;

  -- ------------------------------- no proposals on a challenge that moved on ---
  -- The accept-vs-counter race: the edge function read the challenge status once
  -- at the top of the request, so a counter arriving just after an accept
  -- committed still inserted a pending proposal, stranding it forever.
  UPDATE challenges SET status = 'scheduled' WHERE id = c_done;
  BEGIN
    blocked := false;
    INSERT INTO challenge_proposals (challenge_id, proposed_by_player_id, venue, scheduled_at)
    VALUES (c_done, p_two, 'Eagles 4040', now() + interval '2 days');
  EXCEPTION WHEN check_violation THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    failures := array_append(failures, 'a proposal was accepted onto a scheduled challenge');
  END IF;

  -- ...while an open challenge still takes proposals normally.
  UPDATE challenges SET status = 'accepted' WHERE id = c_done;
  BEGIN
    INSERT INTO challenge_proposals (challenge_id, proposed_by_player_id, venue, scheduled_at)
    VALUES (c_done, p_two, 'Eagles 4040', now() + interval '2 days');
  EXCEPTION WHEN OTHERS THEN
    failures := array_append(failures, format('a proposal on an open challenge was rejected: %s', SQLERRM));
  END;

  -- ----------------------------------------------------------------- report ---
  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'INVARIANTS: % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;

  RAISE NOTICE 'INVARIANTS: ALL CHECKS PASSED';
END $$;
