-- Recovered from Supabase migration history (version 20260521070425).
-- Source: supabase_migrations.schema_migrations
-- Name: track_player_activation

CREATE OR REPLACE FUNCTION public.on_player_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_active = true AND OLD.is_active = false THEN
    NEW.activated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER track_player_activation_trigger
BEFORE UPDATE ON public.players
FOR EACH ROW
EXECUTE FUNCTION public.on_player_activation();
