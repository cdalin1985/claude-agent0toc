-- Give the two append-only tables a ceiling.
--
-- Nothing in this app has ever deleted a row from `notifications` or
-- `activity_feed`. Every challenge issued, answered, expired or washed writes
-- to both; every confirmed result writes two more notifications and a feed
-- line. The rate is a function of how many people are playing, so it is exactly
-- the number that is about to change.
--
-- Being straight about the size of this: at the volumes this league will
-- actually produce, storage is not the problem and will not become one for
-- years -- a busy week is a few hundred rows of a couple of hundred bytes.
-- This is not a capacity fix dressed up as one. It is a ceiling, added while
-- the tables are small enough that adding it is free and provably correct,
-- rather than after they are big enough for someone to want it in a hurry.
--
-- The windows are deliberately generous, because the cost of keeping a row too
-- long is nothing and the cost of deleting one somebody wanted is permanent:
--
--   notifications  -- read, and older than 180 days. An unread notification is
--                     never touched however old it is; it is still someone's
--                     to-do. Only something a member has already opened and
--                     half a year has passed on is dropped.
--   activity_feed  -- older than 2 years. This is the league's public history
--                     and the closest thing TOC has to a record of how the
--                     ladder got into its current shape, so it is kept far
--                     longer than it is read.
--
-- audit_events is deliberately NOT pruned. It is the record of who did what,
-- including every profile claim and every admin ranking change, and it is the
-- thing you go looking for precisely when something has gone wrong months ago.

CREATE OR REPLACE FUNCTION public.prune_old_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notifications integer;
  v_activity      integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.notifications
    WHERE is_read = true
      AND created_at < now() - INTERVAL '180 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_notifications FROM deleted;

  WITH deleted AS (
    DELETE FROM public.activity_feed
    WHERE created_at < now() - INTERVAL '2 years'
    RETURNING 1
  )
  SELECT count(*) INTO v_activity FROM deleted;

  RETURN jsonb_build_object(
    'notifications_deleted', v_notifications,
    'activity_feed_deleted', v_activity,
    'ran_at', now()
  );
END;
$$;

-- SECURITY DEFINER and it deletes rows, so it is closed to members by the same
-- rule as every other definer function here: service_role and cron only.
REVOKE ALL ON FUNCTION public.prune_old_records() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_old_records() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_old_records() TO service_role;

-- Monthly. The windows are measured in months and years, so a daily sweep would
-- be a daily scan to delete nothing. Guarded on pg_cron because CI replays
-- every migration against a plain Postgres that has no such extension, and
-- unschedule-then-schedule so re-applying this is a no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention-prune') THEN
      PERFORM cron.unschedule('retention-prune');
    END IF;
    PERFORM cron.schedule(
      'retention-prune',
      '0 9 1 * *',
      $cron$ SELECT public.prune_old_records(); $cron$
    );
  END IF;
END $$;
