-- Two rules the rulebook has always carried and the app has never enforced.
--
--   "If both players give times but can't agree match is a wash challenging
--    player will sit for 24 hrs. The challenged player may challenge up
--    immediately, if there is not a challenge waiting on their spot."
--
--   "When an inactive player renters the list they must either defend or wait
--    7 days before challenging up!! Exception last player on the list they must
--    wait 24 hrs."
--
-- Both are "you may not challenge UP for a while", which is exactly what the
-- cooldowns table already expresses and what create-challenge already checks
-- before an upward challenge. So neither needs a new mechanism -- they need new
-- cooldown types and something to write them.
--
-- Note what "either defend or wait" means here, because it decides where the
-- rule lives. Defending is passive: somebody else challenges you. A cooldown
-- that only blocks challenging UP already lets a player defend the whole time
-- it is running, so "either defend or wait" needs no extra branch -- it falls
-- out of scoping the block to upward challenges, which create-challenge does.

-- ---------------------------------------------------------------------------
-- 1. Room for the two new types
-- ---------------------------------------------------------------------------
-- 'post_decline' is in the CHECK and has never been written -- production holds
-- three cooldown rows, all 'post_match', all expired. It stays allowed rather
-- than being cleaned up here, because dropping a value from a CHECK is a
-- separate decision from adding two.
ALTER TABLE public.cooldowns DROP CONSTRAINT IF EXISTS cooldowns_type_check;
ALTER TABLE public.cooldowns ADD CONSTRAINT cooldowns_type_check
  CHECK (type IN ('post_match', 'post_decline', 'post_wash', 'post_return'));

COMMENT ON COLUMN public.cooldowns.type IS
  'post_match: lost a match, or won one that moved you up. post_wash: you issued a challenge that ended in a scheduling wash. post_return: you came back from inactivity. post_decline: legacy, never written. Every type except post_decline blocks challenging UP until it expires; none of them blocks defending, and none blocks challenging down.';

-- ---------------------------------------------------------------------------
-- 2. The wash cooldown
-- ---------------------------------------------------------------------------
-- Only the challenger sits. The challenged player is explicitly free to
-- challenge up immediately, so nothing is written for them.
CREATE OR REPLACE FUNCTION public.apply_wash_cooldown(p_challenger_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours     integer;
  v_cooldown  uuid;
BEGIN
  IF p_challenger_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Same knob as the post-match cooldown: the rulebook gives both 24 hours, so
  -- they move together rather than one being silently left behind if the league
  -- ever retunes it.
  SELECT cooldown_hours INTO v_hours
    FROM public.league_settings
   ORDER BY updated_at DESC, id
   LIMIT 1;
  v_hours := COALESCE(v_hours, 24);

  IF v_hours <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.cooldowns(player_id, type, expires_at)
  VALUES (p_challenger_id, 'post_wash', now() + make_interval(hours => v_hours))
  RETURNING id INTO v_cooldown;

  RETURN v_cooldown;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_wash_cooldown(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_wash_cooldown(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_wash_cooldown(uuid) TO service_role;

COMMENT ON FUNCTION public.apply_wash_cooldown(uuid) IS
  'Sits the challenging player for cooldown_hours after a scheduling wash. The challenged player is deliberately given nothing -- the rulebook lets them challenge up immediately.';

-- ---------------------------------------------------------------------------
-- 3. The return cooldown
-- ---------------------------------------------------------------------------
-- Written by a trigger rather than by set-player-active, for the same reason
-- 20260812050000 moved three other rules into the database: an edge function
-- enforces a rule only for callers who go through that edge function. Anyone
-- flipping is_active another way -- a second admin tool, a direct write with the
-- service key, a future migration -- would otherwise hand a returning player a
-- clean slate.
CREATE OR REPLACE FUNCTION public.apply_return_cooldown(p_player_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_position  integer;
  v_last      integer;
  v_hours     integer;
  v_expires   timestamptz;
  v_cooldown  uuid;
BEGIN
  IF p_player_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT position INTO v_position FROM public.rankings WHERE player_id = p_player_id;
  IF v_position IS NULL THEN
    -- No ranking row: nothing to challenge up from, so nothing to sit out.
    RETURN NULL;
  END IF;

  SELECT max(position) INTO v_last FROM public.rankings;

  IF v_position >= COALESCE(v_last, v_position) THEN
    -- "Exception last player on the list they must wait 24 hrs." There is
    -- nobody below them, so a 7-day wait would freeze them out of the ladder
    -- entirely rather than slow them down.
    SELECT cooldown_hours INTO v_hours
      FROM public.league_settings
     ORDER BY updated_at DESC, id
     LIMIT 1;
    v_hours := COALESCE(v_hours, 24);
    IF v_hours <= 0 THEN
      RETURN NULL;
    END IF;
    v_expires := now() + make_interval(hours => v_hours);
  ELSE
    -- Seven days, written as a literal on purpose. It is the only place this
    -- number appears, and giving it an admin-editable setting is how
    -- challenge_response_hours came to sit in the Admin panel doing nothing
    -- while challenge_expiry_days quietly ran the league.
    v_expires := now() + INTERVAL '7 days';
  END IF;

  INSERT INTO public.cooldowns(player_id, type, expires_at)
  VALUES (p_player_id, 'post_return', v_expires)
  RETURNING id INTO v_cooldown;

  RETURN v_cooldown;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_return_cooldown(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_return_cooldown(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_return_cooldown(uuid) TO service_role;

COMMENT ON FUNCTION public.apply_return_cooldown(uuid) IS
  'Sits a returning member for 7 days before they may challenge up, or cooldown_hours if they are last on the list. They may defend throughout -- the cooldown is only read for upward challenges.';

-- The trigger. AFTER UPDATE, not BEFORE: this writes to another table, and a
-- BEFORE trigger that does so runs before the players row is guaranteed to
-- land.
CREATE OR REPLACE FUNCTION public.on_player_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true AND OLD.is_active = false THEN
    PERFORM public.apply_return_cooldown(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.on_player_return() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.on_player_return() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.on_player_return() TO service_role;

DROP TRIGGER IF EXISTS apply_return_cooldown_trigger ON public.players;
CREATE TRIGGER apply_return_cooldown_trigger
  AFTER UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.on_player_return();

COMMENT ON FUNCTION public.on_player_return() IS
  'Writes the post_return cooldown when is_active goes false -> true. A new member is INSERTed active and so never fires this; only an actual return does.';
