-- Match reminders: fire a notification (and push, if pg_net is available)
-- to both players of a scheduled match at 24h and 1h before scheduled_at.
--
-- Runs every 15 minutes via pg_cron. The 15-minute cadence plus a
-- +/-15-minute window on each reminder kind guarantees we never miss a
-- reminder for a scheduled match, even if one cron run is skipped.
--
-- Dedupe is enforced by `match_reminders_log` with a unique constraint on
-- (match_id, player_id, reminder_kind). Re-runs within the window are safe.
--
-- The function is idempotent and safe to call manually via SELECT for testing:
--   SELECT public.check_match_reminders();
--
-- Push delivery requires the `pg_net` extension. If it is not installed,
-- in-app notifications still fire (the client polls `notifications`), only
-- the push delivery is skipped. Verify pg_net on the target project before
-- relying on push.

CREATE TABLE IF NOT EXISTS public.match_reminders_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id    uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  reminder_kind text NOT NULL CHECK (reminder_kind IN ('24h', '1h')),
  sent_at      timestamptz NOT NULL DEFAULT NOW(),
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, player_id, reminder_kind)
);

CREATE INDEX IF NOT EXISTS match_reminders_log_match_id_idx
  ON public.match_reminders_log (match_id);

CREATE OR REPLACE FUNCTION public.check_match_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_24h_min   timestamptz := NOW() + interval '23 hours 45 minutes';
  v_24h_max   timestamptz := NOW() + interval '24 hours 15 minutes';
  v_1h_min    timestamptz := NOW() + interval '45 minutes';
  v_1h_max    timestamptz := NOW() + interval '1 hour 15 minutes';
  v_inserted  integer := 0;
  v_pushed    integer := 0;
  v_pg_net    boolean;
  v_supabase_url text := current_setting('app.supabase_url', true);
  v_service_key   text := current_setting('app.supabase_service_role_key', true);
  rec         record;
  v_notif_id  uuid;
  v_opponent_name text;
  v_player_name   text;
  v_body      text;
  v_title     text;
BEGIN
  -- Detect pg_net availability (guarded so the function works on projects
  -- where the extension is not installed).
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') INTO v_pg_net;

  -- 24-hour reminders
  FOR rec IN
    SELECT m.id AS match_id, m.player1_id AS p1, m.player2_id AS p2,
           m.scheduled_at, m.venue, m.discipline, m.race_length
      FROM matches m
     WHERE m.status = 'scheduled'
       AND m.scheduled_at IS NOT NULL
       AND m.scheduled_at >= v_24h_min
       AND m.scheduled_at <= v_24h_max
  LOOP
    -- Player 1
    IF NOT EXISTS (
      SELECT 1 FROM match_reminders_log
       WHERE match_id = rec.match_id AND player_id = rec.p1 AND reminder_kind = '24h'
    ) THEN
      SELECT full_name INTO v_opponent_name FROM players WHERE id = rec.p2;
      v_title := '⏰ Match tomorrow — ' || COALESCE(v_opponent_name, 'Opponent');
      v_body  := COALESCE(rec.discipline, 'Match') || ' · Race to ' || rec.race_length
                 || ' · ' || COALESCE(rec.venue, 'TBD')
                 || ' · ' || to_char(rec.scheduled_at AT TIME ZONE 'America/Denver', 'Dy Mon DD, HH:MI AM');
      INSERT INTO notifications (player_id, type, title, body, reference_id, reference_type)
        VALUES (rec.p1, 'match_reminder_24h', v_title, v_body, rec.match_id, 'match')
        RETURNING id INTO v_notif_id;
      INSERT INTO match_reminders_log (match_id, player_id, reminder_kind)
        VALUES (rec.match_id, rec.p1, '24h');
      v_inserted := v_inserted + 1;
      v_pushed := v_pushed + send_reminder_push(v_pg_net, v_supabase_url, v_service_key, v_notif_id);
    END IF;

    -- Player 2
    IF NOT EXISTS (
      SELECT 1 FROM match_reminders_log
       WHERE match_id = rec.match_id AND player_id = rec.p2 AND reminder_kind = '24h'
    ) THEN
      SELECT full_name INTO v_opponent_name FROM players WHERE id = rec.p1;
      v_title := '⏰ Match tomorrow — ' || COALESCE(v_opponent_name, 'Opponent');
      v_body  := COALESCE(rec.discipline, 'Match') || ' · Race to ' || rec.race_length
                 || ' · ' || COALESCE(rec.venue, 'TBD')
                 || ' · ' || to_char(rec.scheduled_at AT TIME ZONE 'America/Denver', 'Dy Mon DD, HH:MI AM');
      INSERT INTO notifications (player_id, type, title, body, reference_id, reference_type)
        VALUES (rec.p2, 'match_reminder_24h', v_title, v_body, rec.match_id, 'match')
        RETURNING id INTO v_notif_id;
      INSERT INTO match_reminders_log (match_id, player_id, reminder_kind)
        VALUES (rec.match_id, rec.p2, '24h');
      v_inserted := v_inserted + 1;
      v_pushed := v_pushed + send_reminder_push(v_pg_net, v_supabase_url, v_service_key, v_notif_id);
    END IF;
  END LOOP;

  -- 1-hour reminders
  FOR rec IN
    SELECT m.id AS match_id, m.player1_id AS p1, m.player2_id AS p2,
           m.scheduled_at, m.venue, m.discipline, m.race_length
      FROM matches m
     WHERE m.status = 'scheduled'
       AND m.scheduled_at IS NOT NULL
       AND m.scheduled_at >= v_1h_min
       AND m.scheduled_at <= v_1h_max
  LOOP
    -- Player 1
    IF NOT EXISTS (
      SELECT 1 FROM match_reminders_log
       WHERE match_id = rec.match_id AND player_id = rec.p1 AND reminder_kind = '1h'
    ) THEN
      SELECT full_name INTO v_opponent_name FROM players WHERE id = rec.p2;
      v_title := '🎱 Match starts soon — ' || COALESCE(v_opponent_name, 'Opponent');
      v_body  := 'Starting in about an hour at ' || COALESCE(rec.venue, 'the venue')
                 || '. ' || COALESCE(rec.discipline, '') || ' · Race to ' || rec.race_length;
      INSERT INTO notifications (player_id, type, title, body, reference_id, reference_type)
        VALUES (rec.p1, 'match_reminder_1h', v_title, v_body, rec.match_id, 'match')
        RETURNING id INTO v_notif_id;
      INSERT INTO match_reminders_log (match_id, player_id, reminder_kind)
        VALUES (rec.match_id, rec.p1, '1h');
      v_inserted := v_inserted + 1;
      v_pushed := v_pushed + send_reminder_push(v_pg_net, v_supabase_url, v_service_key, v_notif_id);
    END IF;

    -- Player 2
    IF NOT EXISTS (
      SELECT 1 FROM match_reminders_log
       WHERE match_id = rec.match_id AND player_id = rec.p2 AND reminder_kind = '1h'
    ) THEN
      SELECT full_name INTO v_opponent_name FROM players WHERE id = rec.p1;
      v_title := '🎱 Match starts soon — ' || COALESCE(v_opponent_name, 'Opponent');
      v_body  := 'Starting in about an hour at ' || COALESCE(rec.venue, 'the venue')
                 || '. ' || COALESCE(rec.discipline, '') || ' · Race to ' || rec.race_length;
      INSERT INTO notifications (player_id, type, title, body, reference_id, reference_type)
        VALUES (rec.p2, 'match_reminder_1h', v_title, v_body, rec.match_id, 'match')
        RETURNING id INTO v_notif_id;
      INSERT INTO match_reminders_log (match_id, player_id, reminder_kind)
        VALUES (rec.match_id, rec.p2, '1h');
      v_inserted := v_inserted + 1;
      v_pushed := v_pushed + send_reminder_push(v_pg_net, v_supabase_url, v_service_key, v_notif_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'action', 'checked_reminders',
    'notifications_inserted', v_inserted,
    'pushes_attempted', v_pushed,
    'pg_net_available', v_pg_net,
    'at', NOW()
  );
END;
$$;

-- Helper: fire-and-forget push via pg_net if available. Returns 1 on attempt, 0 on skip.
CREATE OR REPLACE FUNCTION public.send_reminder_push(
  p_pg_net boolean,
  p_supabase_url text,
  p_service_key text,
  p_notification_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
BEGIN
  IF NOT p_pg_net OR p_supabase_url IS NULL OR p_service_key IS NULL THEN
    RETURN 0;
  END IF;
  v_url := rtrim(p_supabase_url, '/') || '/functions/v1/send-match-reminder';
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || p_service_key
    ),
    body := jsonb_build_object('notification_id', p_notification_id)::text
  );
  RETURN 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_match_reminders() TO service_role;
GRANT EXECUTE ON FUNCTION public.send_reminder_push(boolean, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.check_match_reminders() IS
  'Idempotent match-reminder checker. On each call: scans scheduled matches in the 24h (23h45m..24h15m ahead) and 1h (45m..1h15m ahead) windows, inserts deduped notifications for both players, and fires push via pg_net if available. Returns a jsonb summary. Scheduled via pg_cron every 15 minutes.';

-- Schedule the cron job every 15 minutes. Guarded so this is a no-op on
-- preview branches without pg_cron.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'match-reminder-check') THEN
      PERFORM cron.unschedule('match-reminder-check');
    END IF;
    PERFORM cron.schedule(
      'match-reminder-check',
      '*/15 * * * *',
      $cron$ SELECT public.check_match_reminders(); $cron$
    );
  END IF;
END $$;

-- Enable the migration to find the Supabase URL and service role key at runtime.
-- Supabase exposes these as GUCs via `current_setting('app.supabase_url', true)`
-- only if they are set; otherwise the function gracefully skips push.
-- On toc1, set them once via:
--   ALTER DATABASE postgres SET app.supabase_url = 'https://ankvjywsnydpkepdvuvm.supabase.co';
--   ALTER DATABASE postgres SET app.supabase_service_role_key = '<service_role_key>';
-- (The service_role key is already configured as an edge-function secret; this
-- just makes it readable from the cron-triggered function context too.)