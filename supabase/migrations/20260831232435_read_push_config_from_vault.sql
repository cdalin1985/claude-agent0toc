-- Read the push configuration from Vault, because ALTER DATABASE is not
-- available on hosted Supabase.
--
-- send_reminder_push() and check_match_reminders() took the project URL and the
-- service role key from current_setting('app.*'), which assumes somebody ran
--
--   ALTER DATABASE postgres SET app.supabase_url = ...
--
-- On a hosted Supabase project that fails for everyone, including the postgres
-- role the SQL editor and the migration runner both use:
--
--   ERROR: 42501: permission denied to set parameter "app.supabase_url"
--
-- ALTER ROLE is refused the same way. So those settings could never be
-- populated here, current_setting() always returned NULL, send_reminder_push()
-- always returned 0, and every cron run reported success having pushed nothing.
-- The configuration step the code was waiting for was impossible to perform.
--
-- supabase_vault is installed and is the supported mechanism. Secrets live
-- encrypted in vault.secrets; vault.decrypted_secrets exposes them to postgres
-- only -- authenticated has no USAGE on the schema at all, so no member can
-- read them by any route.
--
-- Two named secrets:
--   project_url       -- already created; not sensitive, the frontend ships it
--   service_role_key  -- created by an admin, the only place the key is stored
--
-- The p_supabase_url / p_service_key parameters are kept and used as a fallback
-- so a self-hosted deployment, where ALTER DATABASE does work, keeps behaving
-- as before. Vault wins when present.

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

  -- Vault first. Missing secrets leave these NULL rather than raising, so a
  -- half-configured project degrades to "no push" exactly as before instead of
  -- breaking the reminder insert that has already happened.
  BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  EXCEPTION WHEN OTHERS THEN
    v_url := NULL;
    v_key := NULL;
  END;

  -- Fallback for deployments where ALTER DATABASE is permitted.
  v_url := COALESCE(NULLIF(v_url, ''), NULLIF(p_supabase_url, ''));
  v_key := COALESCE(NULLIF(v_key, ''), NULLIF(p_service_key, ''));

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/send-match-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('notification_id', p_notification_id)::text
  );
  RETURN 1;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.send_reminder_push(boolean, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_reminder_push(boolean, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_reminder_push(boolean, text, text, uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- The status readout has to look in the same place.
-- ---------------------------------------------------------------------------
-- Now SECURITY DEFINER, which it was not before. vault.decrypted_secrets is
-- readable only by postgres -- authenticated has no USAGE on the vault schema,
-- which is exactly right -- so presence cannot be established as the invoker.
--
-- It returns booleans and nothing else: whether each secret EXISTS, never a
-- decrypted value, and never the row. A member gets one capability flag; the
-- breakdown stays admin-only. 04_definer_privileges_assert.sql allowlists it on
-- that basis.
CREATE OR REPLACE FUNCTION public.push_delivery_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_pg_net   boolean;
  v_url      boolean;
  v_key      boolean;
  v_ready    boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND role = ANY (ARRAY['admin'::text, 'super_admin'::text])
  ) INTO v_is_admin;

  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') INTO v_pg_net;

  -- EXISTS on the name only. The secret is never decrypted here.
  SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url')      INTO v_url;
  SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'service_role_key') INTO v_key;

  v_ready := (v_pg_net AND v_url AND v_key);

  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('reminders_can_push', v_ready);
  END IF;

  RETURN jsonb_build_object(
    'pg_net_installed',   v_pg_net,
    'supabase_url_set',   v_url,
    'service_key_set',    v_key,
    'reminders_can_push', v_ready
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.push_delivery_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.push_delivery_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.push_delivery_status() TO authenticated;

COMMENT ON FUNCTION public.push_delivery_status() IS
  'Reports whether match-reminder push can reach a phone, reading Vault for the two secrets. Any signed-in member gets {reminders_can_push}; admins also get which prerequisite is missing. Booleans only -- no secret is ever decrypted or returned.';
