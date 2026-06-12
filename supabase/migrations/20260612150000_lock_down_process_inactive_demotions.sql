-- process_inactive_demotions() is a SECURITY DEFINER maintenance function that
-- demotes inactive players. It is invoked only by the pg_cron job
-- "inactive-demotion-check" (runs as postgres), so public/API roles must not
-- be able to call it via /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.process_inactive_demotions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_inactive_demotions() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_inactive_demotions() FROM PUBLIC;
