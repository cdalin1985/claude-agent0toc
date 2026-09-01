-- send_reminder_push() (20260901051156_send_push_cannot_break_the_reminder.sql)
-- calls net.http_post to deliver match-reminder pushes. Without this
-- extension the p_pg_net guard is false and every push is a silent no-op.
--
-- pg_net is a Supabase-packaged extension, not part of stock Postgres, so it
-- is absent from the plain postgres:17 image the CI rehearsal/replay checks
-- run against (supabase/tests/migrations/00_supabase_shim.sql is deliberately
-- minimal and doesn't provide it either). Every real Supabase project,
-- including toc1, does have it. Same fail-soft posture as send_reminder_push
-- itself: skip rather than abort the migration when it isn't installable.
-- AdminPage's PushDeliveryStatus check already verifies at runtime whether
-- pg_net actually ended up installed, so a skip here can't go unnoticed.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pg_net extension unavailable in this environment, skipping: %', SQLERRM;
END $$;
