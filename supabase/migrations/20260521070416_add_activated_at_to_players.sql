-- Recovered from Supabase migration history (version 20260521070416).
-- Source: supabase_migrations.schema_migrations
-- Name: add_activated_at_to_players

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS activated_at timestamptz;

UPDATE public.players
SET activated_at = created_at
WHERE is_active = true
  AND activated_at IS NULL;
