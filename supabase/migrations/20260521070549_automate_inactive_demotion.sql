-- Recovered from Supabase migration history (version 20260521070549).
-- Source: supabase_migrations.schema_migrations
-- Name: automate_inactive_demotion

CREATE OR REPLACE FUNCTION public.process_inactive_demotions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player RECORD;
  v_drops_owed INTEGER;
  v_current_pos INTEGER;
  v_new_pos INTEGER;
  v_total_players INTEGER;
  v_count INTEGER := 0;
BEGIN
  SELECT count(*) INTO v_total_players FROM rankings;

  FOR v_player IN
    SELECT id, inactivated_at, full_name
    FROM players
    WHERE is_active = false
      AND inactivated_at IS NOT NULL
      AND inactivated_at <= NOW() - INTERVAL '30 days'
  LOOP
    v_drops_owed := floor(EXTRACT(EPOCH FROM (NOW() - v_player.inactivated_at)) / (86400 * 30)) * 2;

    IF v_drops_owed > 0 THEN
      SELECT position INTO v_current_pos FROM rankings WHERE player_id = v_player.id;
      v_new_pos := least(v_current_pos + v_drops_owed, v_total_players);

      IF v_new_pos > v_current_pos THEN
        UPDATE rankings SET position = position - 1 WHERE position > v_current_pos AND position <= v_new_pos;
        UPDATE rankings SET position = v_new_pos WHERE player_id = v_player.id;
        v_count := v_count + 1;

        INSERT INTO activity_feed (event_type, headline, actor_player_id)
        VALUES ('inactive_demotion', v_player.full_name || ' dropped ' || v_drops_owed || ' spots due to 30+ days of inactivity.', v_player.id);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('demoted_count', v_count, 'at', NOW());
END;
$$;

SELECT cron.schedule('inactive-demotion-check', '0 13 * * *', 'SELECT public.process_inactive_demotions();');
