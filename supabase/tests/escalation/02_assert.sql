-- Exercises the deployed guard exactly as a PostgREST end user would. Raises
-- (psql exits non-zero, failing CI) if any escalation succeeds or a legitimate
-- update is wrongly blocked. Prints 'ESCALATION GUARD: ALL CHECKS PASSED' on success.
DO $$
DECLARE
  uid uuid := '11111111-1111-1111-1111-111111111111';
  after_role text;
  failures text[] := '{}';
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);

  -- 1. self-promote role: must be blocked
  BEGIN
    UPDATE profiles SET role = 'super_admin' WHERE id = uid;
    SELECT role INTO after_role FROM profiles WHERE id = uid;
    IF after_role = 'super_admin' THEN failures := array_append(failures, 'role escalation SUCCEEDED'); END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;  -- expected
  END;

  -- 2. self-toggle is_active: must be blocked (and not recurse)
  BEGIN
    UPDATE players SET is_active = NOT is_active WHERE profile_id = uid;
    failures := array_append(failures, 'is_active self-change SUCCEEDED');
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- expected
    WHEN others THEN failures := array_append(failures, ('is_active update errored unexpectedly: ' || SQLSTATE || ' ' || SQLERRM));
  END;

  -- 3. legitimate non-sensitive update: must succeed
  BEGIN
    UPDATE players SET updated_at = now() WHERE profile_id = uid;
    IF NOT FOUND THEN failures := array_append(failures, 'legit player update affected 0 rows'); END IF;
  EXCEPTION WHEN others THEN failures := array_append(failures, ('legit player update blocked: ' || SQLSTATE || ' ' || SQLERRM));
  END;

  -- 4. service-role may change sensitive columns (edge functions)
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  BEGIN
    UPDATE profiles SET role = role WHERE id = uid;
    UPDATE players  SET is_active = is_active WHERE profile_id = uid;
  EXCEPTION WHEN others THEN failures := array_append(failures, ('service_role write blocked: ' || SQLSTATE || ' ' || SQLERRM));
  END;

  IF array_length(failures, 1) > 0 THEN
    RAISE EXCEPTION 'ESCALATION GUARD FAILED: %', array_to_string(failures, ' | ');
  END IF;
  RAISE NOTICE 'ESCALATION GUARD: ALL CHECKS PASSED';
END $$;
