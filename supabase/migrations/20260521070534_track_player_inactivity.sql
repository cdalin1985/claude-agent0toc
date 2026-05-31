-- Recovered from Supabase migration history (version 20260521070534).
-- Source: supabase_migrations.schema_migrations
-- Name: track_player_inactivity

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS inactivated_at timestamptz;

CREATE OR REPLACE FUNCTION public.on_player_inactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_active = false AND OLD.is_active = true THEN
    NEW.inactivated_at = NOW();
  ELSIF NEW.is_active = true AND OLD.is_active = false THEN
    NEW.inactivated_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER track_player_inactivation_trigger
BEFORE UPDATE ON public.players
FOR EACH ROW
EXECUTE FUNCTION public.on_player_inactivation();

UPDATE public.players
SET inactivated_at = updated_at
WHERE is_active = false
  AND inactivated_at IS NULL;
