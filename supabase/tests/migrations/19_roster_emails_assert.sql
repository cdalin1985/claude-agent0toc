-- Runtime assertions for 20260826120000_roster_emails_gate_self_service_claims.sql.
--
-- Two things have to hold, and they pull in opposite directions:
--
--   1. An admin can read and write the roster emails, or the feature is
--      unusable and nobody can be let in.
--   2. Nobody else can read them at all. These are 100 real people's contact
--      details, sitting in a database whose players table is world-readable
--      and whose ClaimPage fetches it with select('*') -- which is the whole
--      reason this lives in its own table rather than as a column.
--
-- The matching itself is enforced in claim-player on the service role, which
-- bypasses RLS by design, so this file cannot test the claim decision. What it
-- can test is that the data the decision reads is reachable by exactly one
-- kind of caller. test/roster-emails.test.mjs pins the decision logic.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'ROSTER EMAILS: ALL CHECKS PASSED' on success.

-- ---------------------------------------------------------------------------
-- Seed, as owner. An admin, an ordinary member, and a player with an address.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  u_admin  uuid := '00000000-0000-4000-8000-0000000000c1';
  u_member uuid := '00000000-0000-4000-8000-0000000000c2';
  p_target uuid := '00000000-0000-4000-8000-0000000000c3';
  p_other  uuid := '00000000-0000-4000-8000-0000000000c4';
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (u_admin,  'roster-admin@example.test'),
    (u_member, 'roster-member@example.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, email, display_name, role) VALUES
    (u_admin,  'roster-admin@example.test',  'Roster Admin',  'admin'),
    (u_member, 'roster-member@example.test', 'Roster Member', 'player')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO players (id, full_name, profile_id) VALUES (p_target, 'Roster Target', NULL)
  ON CONFLICT (id) DO UPDATE SET profile_id = NULL;
  INSERT INTO players (id, full_name) VALUES (p_other, 'Roster Other')
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM player_roster_emails WHERE player_id IN (p_target, p_other);
  INSERT INTO player_roster_emails (player_id, email, added_by)
  VALUES (p_target, 'target@example.test', u_admin);
END $$;

-- ---------------------------------------------------------------------------
-- 1. The shape constraints actually bite.
-- ---------------------------------------------------------------------------
-- Lowercase is not cosmetic: claim-player compares the stored address to the
-- one on the token, and a stored "Target@Example.test" would never match.
DO $$
DECLARE failures text[] := '{}';
BEGIN
  BEGIN
    INSERT INTO player_roster_emails (player_id, email)
    VALUES ('00000000-0000-4000-8000-0000000000c4', 'MiXeD@Example.test');
    failures := array_append(failures, 'a mixed-case address was accepted; it could never match a sign-in');
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO player_roster_emails (player_id, email)
    VALUES ('00000000-0000-4000-8000-0000000000c4', 'not-an-email');
    failures := array_append(failures, 'a value with no @ was accepted as an email');
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- One address, one member. Two rows sharing an email makes a claim
  -- ambiguous, which is exactly what this feature exists to prevent.
  BEGIN
    INSERT INTO player_roster_emails (player_id, email)
    VALUES ('00000000-0000-4000-8000-0000000000c4', 'target@example.test');
    failures := array_append(failures, 'two players were allowed the same sign-up email');
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'ROSTER EMAILS: % CONSTRAINT CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. An ordinary member cannot read anybody's address.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000c2"}', false);
SET ROLE authenticated;

DO $$
DECLARE
  visible  integer;
  failures text[] := '{}';
BEGIN
  -- Either answer is acceptable -- RLS returning no rows, or the grant being
  -- absent entirely. Pinning the outcome, not the mechanism.
  BEGIN
    SELECT count(*) INTO visible FROM player_roster_emails;
    IF visible > 0 THEN
      failures := array_append(failures,
        'an ordinary member read ' || visible || ' roster email(s)');
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- And cannot write one either: setting your own address on somebody else's
  -- name would hand you their profile at the next claim.
  BEGIN
    INSERT INTO player_roster_emails (player_id, email)
    VALUES ('00000000-0000-4000-8000-0000000000c4', 'attacker@example.test');
    failures := array_append(failures,
      'an ordinary member wrote a roster email -- they could point any name at their own inbox');
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLSTATE <> '42501' THEN NULL; END IF;  -- RLS refusal
  END;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'ROSTER EMAILS: % MEMBER CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, false);

-- ---------------------------------------------------------------------------
-- 3. An admin can read and write them.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000c1"}', false);
SET ROLE authenticated;

DO $$
DECLARE
  visible  integer;
  touched  integer;
  failures text[] := '{}';
BEGIN
  SELECT count(*) INTO visible FROM player_roster_emails
   WHERE player_id = '00000000-0000-4000-8000-0000000000c3';
  IF visible <> 1 THEN
    failures := array_append(failures,
      'an admin sees ' || visible || ' row(s) for a player that has one -- the roster is unmanageable');
  END IF;

  UPDATE player_roster_emails SET email = 'corrected@example.test'
   WHERE player_id = '00000000-0000-4000-8000-0000000000c3';
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 1 THEN
    failures := array_append(failures,
      'an admin could not correct an address (' || touched || ' rows)');
  END IF;

  INSERT INTO player_roster_emails (player_id, email)
  VALUES ('00000000-0000-4000-8000-0000000000c4', 'newly-added@example.test');

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'ROSTER EMAILS: % ADMIN CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, false);

-- ---------------------------------------------------------------------------
-- 4. updated_at moves when an address is corrected.
-- ---------------------------------------------------------------------------
-- "Which address did we have on file?" is the question somebody asks after a
-- claim is refused, so a correction has to be visible as a change.
DO $$
DECLARE
  before_at timestamptz;
  after_at  timestamptz;
BEGIN
  SELECT updated_at INTO before_at FROM player_roster_emails
   WHERE player_id = '00000000-0000-4000-8000-0000000000c4';
  PERFORM pg_sleep(0.01);
  UPDATE player_roster_emails SET email = 'touched@example.test'
   WHERE player_id = '00000000-0000-4000-8000-0000000000c4';
  SELECT updated_at INTO after_at FROM player_roster_emails
   WHERE player_id = '00000000-0000-4000-8000-0000000000c4';

  IF after_at IS NOT DISTINCT FROM before_at THEN
    RAISE EXCEPTION 'ROSTER EMAILS: updated_at did not move when an address was corrected';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. The address never reaches a public read path.
-- ---------------------------------------------------------------------------
-- The reason this is a table and not a players column. If somebody later adds
-- the column anyway, or exposes it through the view the whole app reads, this
-- is what says no.
DO $$
DECLARE failures text[] := '{}';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'players_public' AND column_name = 'email'
  ) THEN
    failures := array_append(failures, 'players_public exposes an email column');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'email'
  ) THEN
    failures := array_append(failures,
      'players has an email column -- ClaimPage reads that table with select(*), so it would ship to every member');
  END IF;

  IF has_table_privilege('anon', 'public.player_roster_emails', 'SELECT') THEN
    failures := array_append(failures, 'anon holds SELECT on player_roster_emails');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'ROSTER EMAILS: % EXPOSURE CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'ROSTER EMAILS: ALL CHECKS PASSED'; END $$;
