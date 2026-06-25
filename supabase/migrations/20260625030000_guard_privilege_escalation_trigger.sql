-- Supersedes the WITH CHECK self-escalation guard added in
-- 20260625000000_fix_self_escalation_rls.sql. That approach selected from the
-- same table inside the players UPDATE policy, which Postgres rejects at
-- runtime with "infinite recursion detected in policy". RLS (and column-level
-- REVOKE, which a table-level UPDATE grant overrides) also cannot compare the
-- OLD and NEW row, so column-value changes can't be pinned that way.
--
-- The correct, recursion-free mechanism is a BEFORE UPDATE trigger that
-- compares OLD vs NEW. Service-role callers (edge functions, admin actions)
-- and trusted backend contexts are exempt; direct authenticated end users
-- cannot change profiles.role or players.is_active.

-- Reset the UPDATE policies to plain ownership checks (no self-referential
-- subquery, so no recursion).
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Players can update own player record" ON players;
CREATE POLICY "Players can update own player record" ON players FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

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
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_profile_role ON profiles;
CREATE TRIGGER guard_profile_role BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_privilege_columns();

DROP TRIGGER IF EXISTS guard_player_active ON players;
CREATE TRIGGER guard_player_active BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION public.guard_privilege_columns();
