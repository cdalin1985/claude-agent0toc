-- The Admin Rankings tab used to issue one browser-side UPDATE per row and
-- ignore every returned error. RLS permits reading rankings but not writing
-- them, so the UI reported "Saved" while Postgres rejected the changes. Even
-- with a write policy, swapping two positions that way collides with the
-- non-deferrable UNIQUE constraint on rankings.position.
--
-- Keep ranking mutation behind one narrow RPC. A Postgres function call is one
-- transaction: it either commits the complete ladder and audit event, or rolls
-- all of it back. The same table lock used by match-result and inactivity
-- mutations prevents those operations from interleaving with an admin reorder.

DROP POLICY IF EXISTS "Admins can update rankings" ON public.rankings;
CREATE POLICY "Admins can update rankings"
ON public.rankings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "Admins can record audit events" ON public.audit_events;
CREATE POLICY "Admins can record audit events"
ON public.audit_events
FOR INSERT
TO authenticated
WITH CHECK (
  actor_profile_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'super_admin')
  )
);

CREATE OR REPLACE FUNCTION public.admin_reorder_rankings(p_player_ids uuid[])
RETURNS TABLE (
  player_id uuid,
  ranking_position integer,
  previous_position integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_player_count integer;
  v_max_position integer;
BEGIN
  IF v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = v_actor_id
      AND p.role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Only league administrators can reorder rankings'
      USING ERRCODE = '42501';
  END IF;

  IF p_player_ids IS NULL OR cardinality(p_player_ids) = 0 THEN
    RAISE EXCEPTION 'A complete ranking order is required'
      USING ERRCODE = '22023';
  END IF;

  LOCK TABLE public.rankings IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*), max(r.position)
  INTO v_player_count, v_max_position
  FROM public.rankings AS r;

  IF cardinality(p_player_ids) <> v_player_count THEN
    RAISE EXCEPTION 'Ranking order contains % players; expected %',
      cardinality(p_player_ids), v_player_count
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT requested.player_id)
    FROM unnest(p_player_ids) AS requested(player_id)
  ) <> v_player_count THEN
    RAISE EXCEPTION 'Ranking order contains duplicate players'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_player_ids) AS requested(player_id)
    LEFT JOIN public.rankings AS r ON r.player_id = requested.player_id
    WHERE r.player_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Ranking order contains a player who is not on the ladder'
      USING ERRCODE = '22023';
  END IF;

  -- Move every row beyond the current maximum before assigning the requested
  -- 1..N order. rankings.position is UNIQUE and checked row by row, so an
  -- in-place swap cannot be reliable even inside a transaction.
  UPDATE public.rankings
  SET previous_position = position,
      position = position + v_max_position,
      updated_at = now();

  UPDATE public.rankings AS r
  SET position = requested.position::integer,
      updated_at = now()
  FROM unnest(p_player_ids) WITH ORDINALITY AS requested(player_id, position)
  WHERE r.player_id = requested.player_id;

  INSERT INTO public.audit_events (
    actor_profile_id,
    action,
    target_type,
    detail
  ) VALUES (
    v_actor_id,
    'admin_rankings_reordered',
    'rankings',
    jsonb_build_object('player_ids', to_jsonb(p_player_ids))
  );

  RETURN QUERY
  SELECT r.player_id, r.position AS ranking_position, r.previous_position
  FROM public.rankings AS r
  ORDER BY r.position;
END;
$function$;

-- Functions are executable by PUBLIC unless explicitly locked down.
-- Authenticated callers may reach this SECURITY INVOKER RPC; the database-backed
-- profile-role check and RLS policies both enforce the admin-only mutation.
REVOKE ALL ON FUNCTION public.admin_reorder_rankings(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reorder_rankings(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reorder_rankings(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.admin_reorder_rankings(uuid[]) IS
  'Atomically replaces the complete TOC ladder order for an authenticated admin or super_admin, serializing against other ranking mutations and recording the change in audit_events.';
