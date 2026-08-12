-- Three rules the app believed it was enforcing, moved into the database.
--
-- Each one was enforced only by application code that read a value, decided,
-- and then wrote -- so each failed under exactly the conditions a league night
-- produces: two taps on bad wifi, or a direct PATCH from anyone holding the
-- publishable key.

-- ---------------------------------------------------------------------------
-- 1. A player may not rename themselves on the ladder
-- ---------------------------------------------------------------------------
--
-- 20260807150000 claimed: "players UPDATE for authenticated is a column-level
-- allowlist, so new columns are NOT writable until named here."
--
-- That was not true. Supabase's default privileges grant table-level UPDATE on
-- public tables to `authenticated` (reproduced in the CI shim at
-- tests/migrations/00_supabase_shim.sql:105), and a table-level grant overrides
-- a column-level one -- which 20260625030000's own header says in as many words.
-- No REVOKE on public.players existed anywhere, so the column list was
-- decorative. The proof it was never in force: SettingsPage writes avatar_url,
-- bio and preferred_discipline today, none of which appear in that GRANT.
--
-- guard_privilege_columns pinned players.is_active and profiles.role, so those
-- were genuinely safe. full_name was pinned by nothing: RLS allows a player to
-- update their own row, so any logged-in member could
--   PATCH /rest/v1/players?id=eq.<own id>   {"full_name": "<someone else>"}
-- and rename themselves on the public ladder -- the same names the standings and
-- the $5 fee ledger are read against.
--
-- Both halves are fixed here, because either alone leaves a gap: the REVOKE
-- makes the allowlist real, and the trigger pins full_name even if some future
-- migration re-grants the table.

REVOKE UPDATE ON public.players FROM anon, authenticated;

-- Exactly the cosmetic columns a player may set on themselves. Anything not
-- listed is now genuinely unwritable, which is what the earlier comment
-- promised. avatar_url, bio and preferred_discipline are included because
-- SettingsPage has always written them.
GRANT UPDATE (
  avatar_url,
  banner_url,
  accent_color,
  bio,
  preferred_discipline,
  nickname,
  tagline,
  home_venue,
  years_playing,
  cue_brand
) ON public.players TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_privilege_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  jwt_role text := current_setting('request.jwt.claims', true)::json ->> 'role';
BEGIN
  -- Trusted backends (service role) and non-PostgREST contexts bypass the guard.
  IF jwt_role = 'service_role' OR jwt_role IS NULL THEN
    RETURN NEW;
  END IF;

  -- Reference NEW.role only in the profiles branch and NEW.is_active only in
  -- the players branch; otherwise PL/pgSQL resolves the missing field against
  -- the wrong rowtype and every update errors with 42703.
  IF TG_TABLE_NAME = 'profiles' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Changing role is not permitted' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'players' THEN
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Changing is_active is not permitted' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Identity on the ladder. A player renaming themselves breaks the standings,
    -- the activity feed and every treasury line that names them.
    IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
      RAISE EXCEPTION 'Changing full_name is not permitted' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
      RAISE EXCEPTION 'Changing profile_id is not permitted' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 2. A proposal cannot be added to a challenge that has moved on
-- ---------------------------------------------------------------------------
--
-- respond-to-challenge reads the challenge once at the top of the handler and
-- then trusts that read for the rest of the request. Two concurrent requests --
-- "That works ✓" and "Suggest a different time", which is what a player does
-- when the first tap seems to do nothing on bar wifi -- therefore both saw
-- status = 'accepted' and both returned 200:
--
--   challenge : scheduled, Eagles 4040        (the accept won)
--   proposals : Eagles 4040 = accepted
--               Valley Hub  = pending          <-- orphan, unreachable forever
--
-- One player's app said "you countered, waiting on them"; the league said the
-- match was on at the other bar; the public feed said both. expire_stale_challenges
-- only closes proposals on pending/accepted challenges, so the orphan could never
-- be cleaned up.
--
-- A status re-read in the edge function cannot fix this: any check in
-- application code has a window between the check and the INSERT. Enforcing it
-- on the write itself closes the window, whatever the caller believed.

CREATE OR REPLACE FUNCTION public.reject_proposal_on_settled_challenge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.challenges WHERE id = NEW.challenge_id FOR SHARE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Challenge % does not exist', NEW.challenge_id;
  END IF;

  IF v_status NOT IN ('pending', 'accepted') THEN
    RAISE EXCEPTION 'Challenge % is %, so it is no longer open for scheduling', NEW.challenge_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reject_proposal_on_settled_challenge ON public.challenge_proposals;
CREATE TRIGGER reject_proposal_on_settled_challenge
  BEFORE INSERT ON public.challenge_proposals
  FOR EACH ROW EXECUTE FUNCTION public.reject_proposal_on_settled_challenge();

COMMENT ON FUNCTION public.reject_proposal_on_settled_challenge() IS
  'Refuses a scheduling proposal once its challenge has left pending/accepted. FOR SHARE pins the challenge row for the duration of the insert, so an accept committing concurrently cannot leave an orphan pending proposal behind.';

-- ---------------------------------------------------------------------------
-- 3. One active challenge per player, actually enforced
-- ---------------------------------------------------------------------------
--
-- create-challenge enforced this with two .maybeSingle() reads whose errors were
-- discarded. maybeSingle() ERRORS when more than one row matches, so the moment
-- a player had two active challenges the guard started returning null and let
-- them create unlimited further ones -- it failed open exactly when it mattered.
-- Two concurrent create-challenge calls are enough to reach that state, and
-- nothing in the schema prevented it.
--
-- challenge_proposals already got this right (20260807140000:50). challenges did
-- not. Partial unique indexes, so only live challenges are constrained and the
-- history stays unconstrained.

CREATE UNIQUE INDEX IF NOT EXISTS idx_challenges_one_active_per_challenger
  ON public.challenges(challenger_id)
  WHERE status IN ('pending', 'accepted', 'scheduled', 'in_progress');

CREATE UNIQUE INDEX IF NOT EXISTS idx_challenges_one_active_per_challenged
  ON public.challenges(challenged_id)
  WHERE status IN ('pending', 'accepted', 'scheduled', 'in_progress');

COMMENT ON INDEX public.idx_challenges_one_active_per_challenger IS
  'At most one live challenge issued by a player. The application check in create-challenge failed open once a player already had two; this cannot.';
COMMENT ON INDEX public.idx_challenges_one_active_per_challenged IS
  'At most one live challenge against a player. Pair of idx_challenges_one_active_per_challenger.';
