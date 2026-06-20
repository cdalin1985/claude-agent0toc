-- Recovered from Supabase migration history (version 20251228203910).
-- Source: supabase_migrations.schema_migrations
-- Name: add_robustness_column

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.profiles
      ADD COLUMN IF NOT EXISTS robustness integer DEFAULT 0;
  END IF;
END $$;
