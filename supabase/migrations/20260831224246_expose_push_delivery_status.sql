-- Tell an admin whether match-reminder push can actually deliver.
--
-- check_match_reminders() always writes the in-app notification and only
-- ATTEMPTS a push, via send_reminder_push(), which returns 0 unless pg_net is
-- installed and app.supabase_url / app.supabase_service_role_key are both set.
-- None of those are required for the cron job to report success, so a project
-- missing all three has a perfectly green cron history and has never delivered
-- a single push.
--
-- That is fine as a degradation -- members still get the reminder when they
-- open the app -- but it is invisible. Once VAPID keys are configured the
-- Settings toggle appears, members switch push on, and they get challenge
-- notifications (sent from edge functions over fetch, which needs none of this)
-- while match reminders stay silent. Nothing anywhere says why.
--
-- This exposes the three prerequisites as booleans so the Admin tab can say
-- plainly whether reminders will reach a phone.
--
-- It returns ONLY booleans. app.supabase_service_role_key is a service-role
-- credential; presence is reported, the value is never selected, returned or
-- logged.

CREATE OR REPLACE FUNCTION public.push_delivery_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
-- Deliberately NOT security definer. Everything this reads is available to the
-- caller in their own right: pg_extension is world-readable, current_setting()
-- on a custom GUC works for any role, and the admin check reads only the
-- caller's own profiles row, which the "Users can view own profile" policy
-- already permits. Elevating would put it inside the net that
-- 04_definer_privileges_assert.sql casts over every SECURITY DEFINER function
-- reachable by a member -- correctly, since that guard exists so an in-body
-- role check is never the only thing standing between a member and elevated
-- code. Needing no elevation is a better answer than being an exception to it.
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_pg_net   boolean;
  v_url      boolean;
  v_key      boolean;
BEGIN
  -- Admin only. This reports on the shape of the project's configuration, which
  -- is not a member's business, and fails closed on an unreadable profile.
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND role = ANY (ARRAY['admin'::text, 'super_admin'::text])
  ) INTO v_is_admin;

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Only admins can read push delivery status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') INTO v_pg_net;

  -- Presence only. NULLIF collapses an empty string to NULL so a setting that
  -- exists but is blank reads as missing, which is what it behaves like.
  v_url := NULLIF(current_setting('app.supabase_url', true), '') IS NOT NULL;
  v_key := NULLIF(current_setting('app.supabase_service_role_key', true), '') IS NOT NULL;

  RETURN jsonb_build_object(
    'pg_net_installed',   v_pg_net,
    'supabase_url_set',   v_url,
    'service_key_set',    v_key,
    'reminders_can_push', (v_pg_net AND v_url AND v_key)
  );
END;
$function$;

-- Default privileges GRANT EXECUTE to PUBLIC on a new function. Take that back
-- and hand it out deliberately: this reads server configuration, so a
-- logged-out caller should not reach it at all, and the in-body admin check
-- handles everyone else.
REVOKE ALL ON FUNCTION public.push_delivery_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.push_delivery_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.push_delivery_status() TO authenticated;

COMMENT ON FUNCTION public.push_delivery_status() IS
  'Admin-only, security invoker. Reports whether match-reminder push can reach a phone: pg_net installed, app.supabase_url set, app.supabase_service_role_key set. Returns booleans only and never exposes the key itself.';
