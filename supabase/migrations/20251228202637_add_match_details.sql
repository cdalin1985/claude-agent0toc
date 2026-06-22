-- Recovered from Supabase migration history (version 20251228202637).
-- Source: supabase_migrations.schema_migrations
-- Name: add_match_details

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'matches') THEN
    ALTER TABLE public.matches
      ADD COLUMN IF NOT EXISTS venue text,
      ADD COLUMN IF NOT EXISTS match_date timestamp with time zone;
  END IF;
END $$;
