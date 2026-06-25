-- Minimal Supabase-like harness so the privilege-escalation guard can be
-- exercised in a bare Postgres (CI) without a full migration replay or
-- preview-branch credentials. Reproduces the conditions that mattered in
-- production: PostgREST roles, auth.uid()/auth.role() backed by GUCs, RLS
-- enabled, and a table-level UPDATE grant to `authenticated` (the grant that
-- made column-level REVOKE ineffective).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN;    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.jwt.claims', true)::json ->> 'role';
$$;

CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  role text NOT NULL DEFAULT 'player',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id uuid REFERENCES profiles(id),
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE players  ENABLE ROW LEVEL SECURITY;

-- SELECT policies (the guard migration only manages the UPDATE policies).
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Players select own"          ON players  FOR SELECT USING (profile_id = auth.uid());

-- The pre-guard, ownership-only UPDATE policies. Combined with the table-level
-- UPDATE grant below, these are exactly what let any user self-escalate in
-- production. The guard migration DROPs and replaces these, so they only
-- affect the negative (guard-absent) path — making it a faithful reproduction.
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Players can update own player record" ON players FOR UPDATE
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

-- Reproduce the real-world table-level UPDATE grant to authenticated.
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON players  TO authenticated, anon;

-- Seed one non-privileged user with a player row.
INSERT INTO profiles (id, role) VALUES ('11111111-1111-1111-1111-111111111111', 'player');
INSERT INTO players (profile_id, is_active) VALUES ('11111111-1111-1111-1111-111111111111', true);
