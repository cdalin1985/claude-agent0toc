-- Recovered from Supabase migration history (version 20260531135652).
-- Source: supabase_migrations.schema_migrations
-- Name: align_repo_production_schema

-- Production allows "no maximum race" by storing NULL.
ALTER TABLE league_settings ALTER COLUMN max_race DROP NOT NULL;
ALTER TABLE league_settings ALTER COLUMN max_race DROP DEFAULT;
UPDATE league_settings SET max_race = NULL WHERE max_race IS NOT NULL;

-- Production settings include the active theme name.
ALTER TABLE league_settings
  ADD COLUMN IF NOT EXISTS theme_name TEXT NOT NULL DEFAULT 'classic';

-- Profile customization columns that production and the app expect.
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE players ADD COLUMN IF NOT EXISTS inactivated_at TIMESTAMPTZ;

-- Do not expose profile emails or roles publicly. Authenticated users only
-- need their own profile row; Edge Functions use service_role for admin flows.
DROP POLICY IF EXISTS "Anyone can view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

REVOKE SELECT ON profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;

-- Keep the raw treasury ledger private. Admin UI reads are allowed for
-- admins/super admins; public transparency should come from a sanitized view.
DROP POLICY IF EXISTS "Anyone can view treasury" ON treasury_ledger;
DROP POLICY IF EXISTS "Admins can view treasury" ON treasury_ledger;
CREATE POLICY "Admins can view treasury"
  ON treasury_ledger FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

REVOKE SELECT ON treasury_ledger FROM anon;
GRANT SELECT ON treasury_ledger TO authenticated;
