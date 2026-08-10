-- Enough of a Supabase environment for the full migration history to replay
-- against a bare Postgres, so that "does this migration apply?" is a command
-- rather than a code review.
--
-- Deliberately minimal: this provides only what the migrations reference and
-- Supabase would otherwise supply -- the PostgREST roles, the auth schema, and
-- the extensions. It is NOT a Supabase emulator and must never be trusted for
-- anything the real platform owns (JWT verification, storage, realtime).
--
-- Same spirit as supabase/tests/escalation/00_harness.sql, which does this for
-- one guard; this does it for the whole migration set.

-- PostgREST roles. Migrations GRANT/REVOKE against these by name.
DO $$ BEGIN CREATE ROLE anon NOLOGIN;                 EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN;        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'postgres'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_auth_admin NOLOGIN;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT anon, authenticated, service_role TO authenticator;

-- Supabase installs these into an `extensions` schema and puts it on the search
-- path; uuid_generate_v4() and gen_random_uuid() must resolve unqualified.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto   WITH SCHEMA extensions;

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path TO public, extensions', current_database());
END $$;

-- Realtime publication. Migrations ALTER PUBLICATION ... ADD TABLE against it,
-- which errors rather than no-ops when the publication is absent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- auth.users is the FK target for profiles.id.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id            uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  email         text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Backed by GUCs so a test can impersonate a user the way PostgREST does.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.jwt.claims', true)::json ->> 'role';
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.jwt.claims', true)::json ->> 'email';
$$;

-- Storage. Only the avatars migration touches this: it inserts a bucket and
-- creates four policies on storage.objects using storage.foldername().
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  owner              uuid,
  public             boolean DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id          uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  bucket_id   text REFERENCES storage.buckets(id),
  name        text,
  owner       uuid,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Supabase splits an object path on '/'; policies index [1] for the owner folder.
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array(name, '/');
$$;

GRANT USAGE ON SCHEMA storage    TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth       TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public     TO anon, authenticated, service_role;

-- Supabase grants these by default; several migrations assume table privileges
-- already exist and only REVOKE the columns they want to lock down.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
