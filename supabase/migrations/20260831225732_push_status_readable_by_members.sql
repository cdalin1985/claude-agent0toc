-- Let a member find out whether push will actually buzz their phone.
--
-- push_delivery_status() was admin-only, which left the member-facing half of
-- the problem open. Once VAPID keys are configured the Settings toggle appears
-- for everyone. A member switches push on and gets challenge and result
-- notifications -- those are sent from edge functions over fetch and need none
-- of the reminder plumbing -- but no match reminders, because those originate
-- in pg_cron and need pg_net plus two app settings. Nothing told them, and
-- from where they sit push simply works unreliably.
--
-- So the capability flag is now readable by any signed-in member, while the
-- breakdown of WHICH prerequisite is missing stays admin-only. A member needs
-- to know what they will receive; they do not need to know the shape of the
-- project's configuration.
--
-- Still returns booleans only. The service role key is reported as present or
-- absent and its value is never selected into the payload.

CREATE OR REPLACE FUNCTION public.push_delivery_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
-- Deliberately NOT security definer. pg_extension is world-readable,
-- current_setting() on a custom GUC works for any role, and the admin check
-- reads only the caller's own profiles row, which "Users can view own profile"
-- already permits. Needing no elevation keeps this out of the net
-- 04_definer_privileges_assert.sql casts over SECURITY DEFINER functions a
-- member can reach -- a better answer than being an exception to it.
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

  -- Presence only. NULLIF collapses an empty string to NULL, so a setting that
  -- exists but is blank reads as missing -- which is how it behaves.
  v_url := NULLIF(current_setting('app.supabase_url', true), '') IS NOT NULL;
  v_key := NULLIF(current_setting('app.supabase_service_role_key', true), '') IS NOT NULL;
  v_ready := (v_pg_net AND v_url AND v_key);

  -- Any signed-in member gets the capability flag, so the app can tell them
  -- what a reminder will actually do. Only an admin gets the breakdown.
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
  'Security invoker. Any signed-in member gets {reminders_can_push}; admins also get which of pg_net / app.supabase_url / app.supabase_service_role_key is missing. Booleans only -- the service role key value is never returned.';
