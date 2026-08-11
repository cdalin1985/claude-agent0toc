-- One assertion, applied to EVERY SECURITY DEFINER function rather than to the
-- ones someone remembered to list.
--
-- Postgres grants EXECUTE to PUBLIC on every new function by default, so a
-- migration that only GRANTs to service_role leaves it open -- the GRANT looks
-- like access control and isn't. Four functions shipped that way and were
-- reachable by any logged-in player in production, including one that performs
-- an HTTP POST with a caller-supplied URL and bearer token.
--
-- Naming functions individually is what let that through: a check that only
-- knows about yesterday's functions cannot catch tomorrow's. This enumerates
-- pg_proc, so a new SECURITY DEFINER function is covered the moment it exists.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'DEFINER PRIVILEGES: ALL CHECKS PASSED' on success.

DO $$
DECLARE
  -- The only SECURITY DEFINER function a player may call. It reads one boolean
  -- for one player and writes nothing; the client asks it so the UI can explain
  -- why a notification is muted. Anything added here needs the same standard of
  -- justification.
  allowed  text[] := ARRAY['player_accepts_notification'];
  offenders text;
  n        integer;
  failures text[] := '{}';
BEGIN
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' ORDER BY p.proname)
    INTO offenders
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.prosecdef
     AND NOT (p.proname = ANY (allowed))
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  IF offenders IS NOT NULL THEN
    failures := array_append(failures,
      'SECURITY DEFINER function(s) callable by anon/authenticated: ' || offenders);
  END IF;

  -- The allowlisted one must never be reachable anonymously.
  IF has_function_privilege('anon', 'public.player_accepts_notification(uuid, text)', 'EXECUTE') THEN
    failures := array_append(failures, 'player_accepts_notification is callable anonymously');
  END IF;

  -- Every SECURITY DEFINER function must pin search_path, or a caller-controlled
  -- path can shadow the tables it reads.
  SELECT count(*) INTO n
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.prosecdef
     AND NOT EXISTS (
       SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) AS c
        WHERE c LIKE 'search_path=%'
     );
  IF n > 0 THEN
    failures := array_append(failures, format('%s SECURITY DEFINER function(s) do not pin search_path', n));
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'DEFINER PRIVILEGES: % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;

  RAISE NOTICE 'DEFINER PRIVILEGES: ALL CHECKS PASSED';
END $$;
