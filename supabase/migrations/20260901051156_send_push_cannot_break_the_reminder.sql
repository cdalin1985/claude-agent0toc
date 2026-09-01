-- send_reminder_push() calls net.http_post with the wrong signature, and a
-- failure there destroys the reminder it was trying to announce.
--
-- Two faults, both only reachable once pg_net is installed.
--
-- 1. The wrong signature. This pg_net exposes
--
--      net.http_post(url text, body jsonb, params jsonb, headers jsonb,
--                    timeout_milliseconds integer)
--
--    and the function passed body as ::text, so the call resolved to nothing:
--
--      ERROR: 42883: function net.http_post(url => text, headers => jsonb,
--                                           body => text) does not exist
--
--    Verified by calling it against production on 2026-09-01. Before pg_net was
--    installed the p_pg_net guard returned 0 before ever reaching this line, so
--    the mistake sat unreachable and invisible. Installing the extension to turn
--    push ON is what armed it.
--
-- 2. It takes the reminder down with it. send_reminder_push() is called from
--    check_match_reminders() AFTER the in-app notification row and the
--    match_reminders_log row have been inserted, in the same transaction. An
--    exception anywhere in the push aborts the whole function and rolls both
--    back. So a scheduled match would have produced no reminder AT ALL -- not
--    the push, and not the in-app notification members actually rely on -- and
--    match-reminder-check would have started failing every 15 minutes.
--
--    The in-app reminder is the part the league is promised. A push is a
--    courtesy on top. The courtesy must never be able to delete the promise, so
--    the HTTP call is now wrapped: any failure returns 0 and the reminder
--    stands. That is also why the fix is not merely "drop the ::text" -- a
--    corrected signature would still take the reminder down the next time
--    pg_net times out, or the edge function 500s, or the extension is dropped.

CREATE OR REPLACE FUNCTION public.send_reminder_push(
  p_pg_net          boolean,
  p_supabase_url    text,
  p_service_key     text,
  p_notification_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF NOT p_pg_net THEN
    RETURN 0;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  EXCEPTION WHEN OTHERS THEN
    v_url := NULL;
    v_key := NULL;
  END;

  v_url := COALESCE(NULLIF(v_url, ''), NULLIF(p_supabase_url, ''));
  v_key := COALESCE(NULLIF(v_key, ''), NULLIF(p_service_key, ''));

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN 0;
  END IF;

  -- Everything past this point is best-effort. The caller has already written
  -- the notification the member will see; nothing here may undo it.
  BEGIN
    PERFORM net.http_post(
      url     := rtrim(v_url, '/') || '/functions/v1/send-match-reminder',
      body    := jsonb_build_object('notification_id', p_notification_id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- SQLERRM only. The bearer token is in scope here and must never reach a
    -- log line.
    RAISE WARNING 'send_reminder_push: push failed, reminder kept (%)', SQLERRM;
    RETURN 0;
  END;

  RETURN 1;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.send_reminder_push(boolean, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_reminder_push(boolean, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_reminder_push(boolean, text, text, uuid) FROM authenticated;

COMMENT ON FUNCTION public.send_reminder_push(boolean, text, text, uuid) IS
  'Best-effort push for a match reminder. Reads project_url and service_role_key from Vault. Returns 1 if the HTTP call was dispatched, 0 otherwise. Never raises: the caller has already committed the in-app notification and a failed courtesy push must not roll it back.';
