-- The no-show rule, added to the board 2 August 2026 and never implemented.
--
--   "A no show w/o letting your opponent know will drop you to the challengers
--    original spot. Both players will swap spots in the standings."
--
-- Two things about the shape of this, because they decide the whole design.
--
-- 1. WHO APPLIES IT. Every other ranking move in this app is triggered by
--    something a player does to themselves: you lose, you decline, you withdraw.
--    A no-show is the first one that is an accusation about somebody ELSE, and
--    the penalty is a rank swap. Self-service would let any member move a rival
--    down the ladder by claiming they did not turn up, with the burden of proof
--    on the accused. So this is admin-applied: the players tell an admin, the
--    admin applies it, and the app makes the ladder move correctly and records
--    who did it. That is the part worth automating -- an admin renumbering
--    positions by hand is exactly how a ladder gets corrupted.
--
-- 2. WHICH DIRECTION. "drop you to the challengers original spot" reads as
--    written for the usual case: the challenged player, who is normally the
--    higher-ranked one, fails to appear. But a top-10 player may challenge DOWN,
--    and a challenger can be the no-show, so the pair can be either way round.
--    Applied literally as "swap, always", a lower-ranked player who no-showed
--    would be PROMOTED for it.
--
--    So the swap happens only when it moves the no-show DOWN. When the no-show
--    is already below their opponent there is no positional penalty available --
--    "drop you to the challenger's original spot" would be a climb -- and the
--    function records the event without touching the ladder. Flagged in the
--    README as the one place this implementation had to read past the literal
--    text; if the league wants a different answer there, this is the function
--    to change.

-- ---------------------------------------------------------------------------
-- A cancel reason of its own
-- ---------------------------------------------------------------------------
-- Not 'withdrawn' and not 'wash'. Both of those are refunded or neutral, and a
-- no-show is neither -- it must be visible in the history as what it was.
ALTER TABLE public.challenges DROP CONSTRAINT IF EXISTS challenges_cancel_reason_check;
ALTER TABLE public.challenges ADD CONSTRAINT challenges_cancel_reason_check
  CHECK (cancel_reason IS NULL OR cancel_reason IN ('wash', 'withdrawn', 'overdue', 'no_show'));

COMMENT ON COLUMN public.challenges.cancel_reason IS
  'wash: the two could not agree a time. withdrawn: the challenger walked away before it was accepted. overdue: the 10-day window ran out. no_show: one player did not turn up without telling the other, and an admin applied the spot swap.';

-- ---------------------------------------------------------------------------
-- The swap
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_no_show_swap(
  p_challenge_id       uuid,
  p_no_show_player_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge   RECORD;
  v_opponent_id uuid;
  v_no_show_pos integer;
  v_opp_pos     integer;
  v_swapped     boolean := false;
BEGIN
  -- Same lock every other ranking mutation takes. A swap is two UPDATEs against
  -- a non-deferrable UNIQUE; interleaving it with a cascade or a demotion is
  -- how positions end up doubly held.
  LOCK TABLE public.rankings IN SHARE ROW EXCLUSIVE MODE;

  SELECT id, challenger_id, challenged_id, status
    INTO v_challenge
    FROM public.challenges
   WHERE id = p_challenge_id
     FOR UPDATE;

  IF v_challenge.id IS NULL THEN
    RAISE EXCEPTION 'Challenge % does not exist', p_challenge_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_no_show_player_id NOT IN (v_challenge.challenger_id, v_challenge.challenged_id) THEN
    RAISE EXCEPTION 'Player % is not part of challenge %', p_no_show_player_id, p_challenge_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- A no-show is a failure to turn up to an arranged match, so there has to
  -- have been one arranged. Guarding here rather than in the caller: this
  -- function moves the ladder and must not depend on an edge function having
  -- checked first.
  IF v_challenge.status NOT IN ('accepted', 'scheduled') THEN
    RAISE EXCEPTION 'Challenge % is %, so no match was arranged to miss', p_challenge_id, v_challenge.status
      USING ERRCODE = 'check_violation';
  END IF;

  v_opponent_id := CASE
    WHEN p_no_show_player_id = v_challenge.challenger_id THEN v_challenge.challenged_id
    ELSE v_challenge.challenger_id
  END;

  SELECT position INTO v_no_show_pos FROM public.rankings WHERE player_id = p_no_show_player_id;
  SELECT position INTO v_opp_pos     FROM public.rankings WHERE player_id = v_opponent_id;

  IF v_no_show_pos IS NULL OR v_opp_pos IS NULL THEN
    RAISE EXCEPTION 'Both players must hold a ranking position to swap'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Only ever a demotion for the no-show. See the header: a literal always-swap
  -- would promote a lower-ranked player for failing to appear.
  IF v_no_show_pos < v_opp_pos THEN
    -- Park one side clear of the live ladder so the UNIQUE on position is never
    -- transiently violated. The ladder is ~100 rows; 1000+ is empty.
    UPDATE public.rankings
       SET position = position + 1000, updated_at = now()
     WHERE player_id = p_no_show_player_id;

    UPDATE public.rankings
       SET previous_position = v_opp_pos,
           position          = v_no_show_pos,
           rank1_since       = CASE WHEN v_no_show_pos = 1 THEN now() ELSE rank1_since END,
           updated_at        = now()
     WHERE player_id = v_opponent_id;

    UPDATE public.rankings
       SET previous_position = v_no_show_pos,
           position          = v_opp_pos,
           -- Moving down, so they cannot hold rank 1 afterwards.
           rank1_since       = NULL,
           updated_at        = now()
     WHERE player_id = p_no_show_player_id;

    v_swapped := true;
  END IF;

  UPDATE public.challenges
     SET status = 'cancelled', cancel_reason = 'no_show', updated_at = now()
   WHERE id = p_challenge_id;

  -- Close the unplayed match, if one exists. Scoped to 'scheduled' so a match
  -- that somehow started is left alone rather than silently resolved.
  UPDATE public.matches
     SET status = 'resolved', updated_at = now()
   WHERE challenge_id = p_challenge_id AND status = 'scheduled';

  RETURN jsonb_build_object(
    'swapped',          v_swapped,
    'no_show_player_id', p_no_show_player_id,
    'opponent_id',      v_opponent_id,
    'no_show_from',     v_no_show_pos,
    'no_show_to',       CASE WHEN v_swapped THEN v_opp_pos ELSE v_no_show_pos END,
    'opponent_from',    v_opp_pos,
    'opponent_to',      CASE WHEN v_swapped THEN v_no_show_pos ELSE v_opp_pos END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_no_show_swap(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_no_show_swap(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_no_show_swap(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.apply_no_show_swap(uuid, uuid) IS
  'Swaps a no-show with their opponent, but only when that moves the no-show DOWN -- a literal always-swap would promote a lower-ranked player for failing to appear. Cancels the challenge as no_show and closes any unplayed match. Admin-applied: this is the one ranking move that is an accusation about somebody else, so it is never self-service.';
