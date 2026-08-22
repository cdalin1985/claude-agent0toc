-- The lock-in rule, the last one the app carried in prose only.
--
--   "If you defend your spot you may challenge up immediately which means you
--    must include a challenge with your results to lock in a challenge if you
--    do not you are open to challenges from behind until you do so."
--
-- The sentence only means something if locking in STOPS you being open to
-- challenges from behind -- in the app everyone is always challengeable, so
-- read as pure description the clause does nothing. So a locked-in challenge is
-- a shield: while it is live, nobody below may challenge you.
--
-- The right has no clock. A defender holds it until one of two things happens:
--
--   they use it     -- their next challenge is flagged locked_in and shields them
--   somebody below  -- challenges them first, and the right lapses; that is
--   uses it first      exactly the "you are open to challenges from behind
--                      until you do so" case
--
-- Which makes it a race, deliberately. Post your challenge with your results and
-- you are protected; sit on it and the first player behind you can take the
-- opening.
--
-- "Defend your spot" means you were challenged and you won. A top-10 player who
-- challenges DOWN and wins has not defended anything -- they attacked and
-- nothing moved -- so the right is granted only to a winning CHALLENGED player.

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS lock_in_right BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.players.lock_in_right IS
  'This player defended their spot and has not yet either locked in a challenge or been challenged from behind. Granted by grant_lock_in_right_trigger, spent by create-challenge, lapsed when somebody below challenges them first.';

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS locked_in BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.challenges.locked_in IS
  'Issued by a player spending the right they earned by defending. While this challenge is live its challenger cannot be challenged from behind.';

-- ---------------------------------------------------------------------------
-- Granting the right
-- ---------------------------------------------------------------------------
-- A trigger on matches rather than a line in submit-result, because three paths
-- finish a match -- submit-result, resolve-dispute, and an admin forfeit -- and
-- a rule written into one of them is a rule the other two skip. Same reasoning
-- as 20260812050000 and the return cooldown.
CREATE OR REPLACE FUNCTION public.grant_lock_in_right()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenged_id uuid;
BEGIN
  -- Only on the transition into a finished state, so a later touch of an
  -- already-confirmed row does not re-grant a right the player has since spent.
  IF NEW.status NOT IN ('confirmed', 'resolved') THEN
    RETURN NULL;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NULL;
  END IF;
  IF NEW.winner_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT challenged_id INTO v_challenged_id
    FROM public.challenges WHERE id = NEW.challenge_id;

  -- Defending is winning as the challenged player. Winning a challenge you
  -- issued -- including a top-10 player challenging down -- is not a defence.
  IF v_challenged_id IS NOT NULL AND NEW.winner_id = v_challenged_id THEN
    UPDATE public.players SET lock_in_right = true WHERE id = NEW.winner_id;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_lock_in_right() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_lock_in_right() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_lock_in_right() TO service_role;

DROP TRIGGER IF EXISTS grant_lock_in_right_trigger ON public.matches;
CREATE TRIGGER grant_lock_in_right_trigger
  AFTER UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.grant_lock_in_right();

-- ---------------------------------------------------------------------------
-- The shield, enforced where the challenge is written
-- ---------------------------------------------------------------------------
-- create-challenge checks this too, so a player gets a sentence explaining why
-- rather than a constraint error. This is the guard that actually holds: the
-- application check reads and then writes, and two taps on bar wifi fit between.
CREATE OR REPLACE FUNCTION public.reject_challenge_against_locked_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked uuid;
BEGIN
  SELECT id INTO v_locked
    FROM public.challenges
   WHERE challenger_id = NEW.challenged_id
     AND locked_in = true
     AND status IN ('pending', 'accepted', 'scheduled', 'in_progress')
   LIMIT 1;

  IF v_locked IS NOT NULL THEN
    RAISE EXCEPTION 'Player % has locked in a challenge and cannot be challenged from behind until it is settled', NEW.challenged_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Being challenged is what ends the opportunity for a defender who sat on it.
  -- Done here rather than in the edge function so it holds for every write path,
  -- and in the same statement that creates the challenge so there is no window
  -- where both players think they have the opening.
  UPDATE public.players
     SET lock_in_right = false
   WHERE id = NEW.challenged_id AND lock_in_right = true;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_challenge_against_locked_in() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_challenge_against_locked_in() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_challenge_against_locked_in() TO service_role;

DROP TRIGGER IF EXISTS reject_challenge_against_locked_in ON public.challenges;
CREATE TRIGGER reject_challenge_against_locked_in
  BEFORE INSERT ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.reject_challenge_against_locked_in();

COMMENT ON FUNCTION public.reject_challenge_against_locked_in() IS
  'Refuses a challenge against a player who has locked one in, and lapses the defender right of anyone who gets challenged before spending it. Both halves happen in the insert itself, so there is no window in which two players believe they hold the same opening.';
