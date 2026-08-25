-- Runtime assertions for 20260825121000_rls_evaluate_auth_uid_once_per_query.sql.
--
-- That migration's whole claim is "nothing changes except how often auth.uid()
-- runs". A rewrite of seven policies that is only reviewed by reading it is
-- exactly the change that quietly opens or closes a door, so this exercises the
-- doors instead.
--
-- The stats tables are already covered behaviourally by 07_visibility_assert
-- (owner exception, opt-out honoured), which runs on every replay after this
-- migration -- so if the rewrite broke those, 07_ fails and this file does not
-- need to repeat it. What is NOT covered anywhere else is the `players` policy
-- split: "Admins can manage players" was FOR ALL and is now three write-only
-- policies. Getting that wrong either strands the admins or hands writes to
-- everybody, and neither shows up in a SELECT.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'RLS REWRITE: ALL CHECKS PASSED' on success.

-- ---------------------------------------------------------------------------
-- Seed, as owner. One admin, one ordinary member, one unrelated player.
-- ---------------------------------------------------------------------------
-- Fixed ids + ON CONFLICT: the replay workflow runs every assert file twice.
DO $$
DECLARE
  u_admin  uuid := '00000000-0000-4000-8000-0000000000f1';
  u_member uuid := '00000000-0000-4000-8000-0000000000f2';
  p_admin  uuid := '00000000-0000-4000-8000-0000000000f3';
  p_member uuid := '00000000-0000-4000-8000-0000000000f4';
  p_other  uuid := '00000000-0000-4000-8000-0000000000f5';
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (u_admin,  'rls-admin@example.test'),
    (u_member, 'rls-member@example.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, email, display_name, role) VALUES
    (u_admin,  'rls-admin@example.test',  'RLS Admin',  'admin'),
    (u_member, 'rls-member@example.test', 'RLS Member', 'player')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO players (id, full_name, profile_id, nickname) VALUES
    (p_admin,  'RLS Admin',  u_admin,  'seed'),
    (p_member, 'RLS Member', u_member, 'seed')
  ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, profile_id = EXCLUDED.profile_id;

  INSERT INTO players (id, full_name, nickname) VALUES
    (p_other, 'RLS Bystander', 'seed')
  ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Structure: one permissive SELECT policy on players, not two.
-- ---------------------------------------------------------------------------
-- This is the only assertion here that pins the mechanism rather than an
-- outcome, and it is the point of the change: "Anyone can view players" is
-- USING (true), so a second permissive SELECT policy alongside it can never
-- change an answer -- it can only run an EXISTS against profiles for every row
-- of every ladder read. Asserting the outcome would pass either way.
DO $$
DECLARE
  select_policies integer;
  failures text[] := '{}';
BEGIN
  SELECT count(*) INTO select_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'players'
     AND permissive = 'PERMISSIVE'
     AND cmd IN ('SELECT', 'ALL');

  IF select_policies <> 1 THEN
    failures := array_append(failures,
      'players has ' || select_policies || ' permissive policies on the read path, expected exactly 1');
  END IF;

  -- The write half must not have gone missing with it.
  FOR i IN 1..1 LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='players' AND cmd='INSERT') THEN
      failures := array_append(failures, 'players has no INSERT policy -- admins cannot add anyone');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='players' AND cmd='DELETE') THEN
      failures := array_append(failures, 'players has no DELETE policy');
    END IF;
  END LOOP;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RLS REWRITE: % STRUCTURE CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. An admin can still write to the roster.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000f1"}', false);
SET ROLE authenticated;

DO $$
DECLARE
  touched integer;
  failures text[] := '{}';
BEGIN
  UPDATE players SET nickname = 'admin-wrote' WHERE id = '00000000-0000-4000-8000-0000000000f5';
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 1 THEN
    failures := array_append(failures,
      'an admin updated ' || touched || ' row(s) on another player, expected 1 -- the FOR ALL split stranded the admins');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RLS REWRITE: % ADMIN WRITE CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, false);

-- ---------------------------------------------------------------------------
-- 3. An ordinary member writes to their own row and nobody else's.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000f2"}', false);
SET ROLE authenticated;

DO $$
DECLARE
  touched  integer;
  visible  integer;
  failures text[] := '{}';
BEGIN
  -- Own row: allowed.
  UPDATE players SET nickname = 'mine' WHERE id = '00000000-0000-4000-8000-0000000000f4';
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 1 THEN
    failures := array_append(failures,
      'a member updated ' || touched || ' row(s) of their own record, expected 1');
  END IF;

  -- Somebody else's row: silently filtered to zero, not an error.
  UPDATE players SET nickname = 'stolen' WHERE id = '00000000-0000-4000-8000-0000000000f5';
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 0 THEN
    failures := array_append(failures,
      'a member updated ' || touched || ' row(s) belonging to another player');
  END IF;

  -- Deleting anyone: never.
  BEGIN
    DELETE FROM players WHERE id = '00000000-0000-4000-8000-0000000000f5';
    GET DIAGNOSTICS touched = ROW_COUNT;
    IF touched <> 0 THEN
      failures := array_append(failures,
        'a member deleted ' || touched || ' player row(s)');
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- Reading the ladder still works for everyone -- the half of the FOR ALL
  -- policy that was removed must not have taken the roster with it.
  SELECT count(*) INTO visible FROM players;
  IF visible < 3 THEN
    failures := array_append(failures,
      'a member can only see ' || visible || ' player(s) -- the ladder is no longer readable');
  END IF;

  -- Own profile row is visible; the admin's is not.
  SELECT count(*) INTO visible FROM profiles;
  IF visible <> 1 THEN
    failures := array_append(failures,
      'a member sees ' || visible || ' profile row(s), expected exactly their own');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RLS REWRITE: % MEMBER CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, false);

-- ---------------------------------------------------------------------------
-- 4. Preferences stay self-service only.
-- ---------------------------------------------------------------------------
INSERT INTO player_preferences (player_id, show_stats_publicly) VALUES
  ('00000000-0000-4000-8000-0000000000f4', TRUE),
  ('00000000-0000-4000-8000-0000000000f5', TRUE)
ON CONFLICT (player_id) DO UPDATE SET show_stats_publicly = EXCLUDED.show_stats_publicly;

SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000f2"}', false);
SET ROLE authenticated;

DO $$
DECLARE
  touched  integer;
  failures text[] := '{}';
BEGIN
  UPDATE player_preferences SET show_stats_publicly = FALSE
   WHERE player_id = '00000000-0000-4000-8000-0000000000f4';
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 1 THEN
    failures := array_append(failures,
      'a member updated ' || touched || ' row(s) of their own preferences, expected 1');
  END IF;

  UPDATE player_preferences SET show_stats_publicly = FALSE
   WHERE player_id = '00000000-0000-4000-8000-0000000000f5';
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 0 THEN
    failures := array_append(failures,
      'a member changed ' || touched || ' row(s) of another player''s privacy settings');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RLS REWRITE: % PREFERENCES CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, false);

DO $$ BEGIN RAISE NOTICE 'RLS REWRITE: ALL CHECKS PASSED'; END $$;
