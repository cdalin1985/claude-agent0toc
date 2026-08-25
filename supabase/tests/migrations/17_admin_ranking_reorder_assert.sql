-- Runtime proof for the admin ranking reorder RPC. Static source checks cannot
-- prove that a swap survives rankings.position UNIQUE, that the whole ladder is
-- renumbered without gaps, or that a non-admin is rejected.

BEGIN;

DO $$
DECLARE
  v_admin_id uuid := '00000000-0000-4000-8000-00000000e001';
  v_player_profile_id uuid := '00000000-0000-4000-8000-00000000e002';
  v_first uuid := '00000000-0000-4000-8000-00000000e011';
  v_second uuid := '00000000-0000-4000-8000-00000000e012';
  v_base integer;
  v_count integer;
  v_order uuid[];
  v_invalid_order uuid[];
  v_first_position integer;
  v_second_position integer;
  v_first_expected integer;
  v_second_expected integer;
  v_first_previous integer;
  v_second_previous integer;
  v_audit_count integer;
  v_raised boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_admin_id, 'ranking-admin-assert@toc.invalid'),
    (v_player_profile_id, 'ranking-player-assert@toc.invalid');

  -- on_auth_user_created already inserted both profiles.
  UPDATE public.profiles
  SET role = CASE
    WHEN id = v_admin_id THEN 'super_admin'
    ELSE 'player'
  END
  WHERE id IN (v_admin_id, v_player_profile_id);

  INSERT INTO public.players (id, full_name, is_active) VALUES
    (v_first, 'Ranking Assert First', true),
    (v_second, 'Ranking Assert Second', true);

  SELECT COALESCE(max(position), 0) INTO v_base FROM public.rankings;
  INSERT INTO public.rankings (player_id, position) VALUES
    (v_first, v_base + 1),
    (v_second, v_base + 2);

  -- Reverse the two fixtures while leaving every other player in their current
  -- relative order. The old parallel UPDATE implementation collides here.
  SELECT array_agg(r.player_id ORDER BY
    CASE
      WHEN r.player_id = v_first THEN v_base + 2
      WHEN r.player_id = v_second THEN v_base + 1
      ELSE r.position
    END
  ) INTO v_order
  FROM public.rankings AS r;

  v_first_expected := array_position(v_order, v_first);
  v_second_expected := array_position(v_order, v_second);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin_id, 'role', 'authenticated')::text,
    true
  );
  -- Exercise the SECURITY INVOKER function with the same Postgres transport
  -- role PostgREST uses, so the admin-only rankings/audit RLS policies are part
  -- of this proof rather than being bypassed by the test runner's superuser.
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.admin_reorder_rankings(v_order);

  SELECT position, previous_position
  INTO v_first_position, v_first_previous
  FROM public.rankings WHERE player_id = v_first;

  SELECT position, previous_position
  INTO v_second_position, v_second_previous
  FROM public.rankings WHERE player_id = v_second;

  IF v_first_position IS DISTINCT FROM v_first_expected
     OR v_second_position IS DISTINCT FROM v_second_expected THEN
    RAISE EXCEPTION 'ADMIN RANKING REORDER: swap failed; first=%, second=%',
      v_first_position, v_second_position;
  END IF;

  IF v_first_previous IS DISTINCT FROM v_base + 1
     OR v_second_previous IS DISTINCT FROM v_base + 2 THEN
    RAISE EXCEPTION 'ADMIN RANKING REORDER: previous positions were not preserved';
  END IF;

  SELECT count(*), max(position) INTO v_count, v_base FROM public.rankings;
  IF v_base IS DISTINCT FROM v_count OR EXISTS (
    SELECT 1 FROM public.rankings GROUP BY position HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ADMIN RANKING REORDER: ladder is not contiguous and unique';
  END IF;

  IF EXISTS (SELECT 1 FROM public.rankings WHERE position > v_count) THEN
    RAISE EXCEPTION 'ADMIN RANKING REORDER: a row was left parked outside the live ladder';
  END IF;

  SELECT count(*) INTO v_audit_count
  FROM public.audit_events
  WHERE actor_profile_id = v_admin_id
    AND action = 'admin_rankings_reordered';

  IF v_audit_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'ADMIN RANKING REORDER: expected one audit event, found %', v_audit_count;
  END IF;

  -- A duplicate necessarily omits another player. It must be rejected before
  -- any ranking is parked or changed.
  v_invalid_order := v_order;
  v_invalid_order[array_length(v_invalid_order, 1)] := v_invalid_order[1];
  v_raised := false;
  BEGIN
    PERFORM public.admin_reorder_rankings(v_invalid_order);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'ADMIN RANKING REORDER: duplicate order was accepted';
  END IF;

  -- Authenticated is only the transport role. The database-backed profile role
  -- is the authorization decision.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_player_profile_id, 'role', 'authenticated')::text,
    true
  );
  v_raised := false;
  BEGIN
    PERFORM public.admin_reorder_rankings(v_order);
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'ADMIN RANKING REORDER: a player profile reordered the ladder';
  END IF;
END $$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.admin_reorder_rankings(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'ADMIN RANKING REORDER: anon can execute the RPC';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.admin_reorder_rankings(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'ADMIN RANKING REORDER: authenticated admins cannot reach the RPC';
  END IF;
END $$;

ROLLBACK;

DO $$ BEGIN RAISE NOTICE 'ADMIN RANKING REORDER: ALL CHECKS PASSED'; END $$;
