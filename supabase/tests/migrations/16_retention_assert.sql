-- Runtime assertions for 20260825120000_retention_for_notifications_and_activity_feed.sql.
--
-- A prune function is only ever wrong in one of two directions, and both are
-- silent: it deletes something it should have kept, or it keeps everything and
-- reports success. A test that just calls it and checks it did not error would
-- pass in both cases -- which is the same shape as the inactivity demotion that
-- returned demoted_count 0 every day for three months.
--
-- So this seeds rows on both sides of every boundary and names the survivors.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'RETENTION: ALL CHECKS PASSED' on success.

DO $$
DECLARE
  p_keep uuid := '00000000-0000-4000-8000-0000000000e1';
  result jsonb;

  n_old_read    uuid := '00000000-0000-4000-8000-0000000000e2';
  n_old_unread  uuid := '00000000-0000-4000-8000-0000000000e3';
  n_new_read    uuid := '00000000-0000-4000-8000-0000000000e4';
  a_old         uuid := '00000000-0000-4000-8000-0000000000e5';
  a_new         uuid := '00000000-0000-4000-8000-0000000000e6';

  failures text[] := '{}';
BEGIN
  INSERT INTO players (id, full_name) VALUES (p_keep, 'Retention Fixture')
  ON CONFLICT (id) DO NOTHING;

  -- Wipe any survivors from a previous pass so the second replay starts clean.
  DELETE FROM notifications  WHERE id IN (n_old_read, n_old_unread, n_new_read);
  DELETE FROM activity_feed  WHERE id IN (a_old, a_new);

  -- created_at is set in the same INSERT deliberately: neither table has a
  -- trigger that overwrites it, unlike players.inactivated_at (see
  -- 10_inactive_demotion_assert). If one is ever added, these rows stop being
  -- old and the "deleted" assertions below start failing rather than passing
  -- vacuously.
  INSERT INTO notifications (id, player_id, type, title, body, is_read, created_at) VALUES
    -- read and past the window: the only notification that should go
    (n_old_read,   p_keep, 'test', 'old read',   'x', true,  now() - INTERVAL '200 days'),
    -- unread, and far older still: age alone must never delete a member's to-do
    (n_old_unread, p_keep, 'test', 'old unread', 'x', false, now() - INTERVAL '400 days'),
    -- read but inside the window
    (n_new_read,   p_keep, 'test', 'new read',   'x', true,  now() - INTERVAL '10 days');

  INSERT INTO activity_feed (id, event_type, headline, created_at) VALUES
    (a_old, 'test_event', 'old feed line', now() - INTERVAL '3 years'),
    (a_new, 'test_event', 'new feed line', now() - INTERVAL '30 days');

  result := public.prune_old_records();

  -- --- notifications -------------------------------------------------------
  IF EXISTS (SELECT 1 FROM notifications WHERE id = n_old_read) THEN
    failures := array_append(failures,
      'a read notification older than 180 days survived the prune');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM notifications WHERE id = n_old_unread) THEN
    failures := array_append(failures,
      'an UNREAD notification was deleted for being old -- unread is somebody''s to-do at any age');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM notifications WHERE id = n_new_read) THEN
    failures := array_append(failures,
      'a read notification from inside the 180-day window was deleted');
  END IF;

  -- --- activity feed -------------------------------------------------------
  IF EXISTS (SELECT 1 FROM activity_feed WHERE id = a_old) THEN
    failures := array_append(failures,
      'an activity_feed row older than 2 years survived the prune');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM activity_feed WHERE id = a_new) THEN
    failures := array_append(failures,
      'a recent activity_feed row was deleted -- the league''s history is being thrown away');
  END IF;

  -- --- the report it returns ----------------------------------------------
  -- The counts are what a future operator reads to decide whether this job is
  -- doing anything. A function that deleted correctly but reported zero would
  -- pass every check above.
  IF COALESCE((result ->> 'notifications_deleted')::integer, -1) < 1 THEN
    failures := array_append(failures,
      'prune_old_records reported notifications_deleted = ' ||
      COALESCE(result ->> 'notifications_deleted', 'null') || ' after deleting one');
  END IF;

  IF COALESCE((result ->> 'activity_feed_deleted')::integer, -1) < 1 THEN
    failures := array_append(failures,
      'prune_old_records reported activity_feed_deleted = ' ||
      COALESCE(result ->> 'activity_feed_deleted', 'null') || ' after deleting one');
  END IF;

  -- --- idempotence ---------------------------------------------------------
  -- Runs monthly forever; a second call with nothing left to do must be a
  -- no-op that says so, not an error and not another sweep of live rows.
  result := public.prune_old_records();
  IF COALESCE((result ->> 'notifications_deleted')::integer, -1) <> 0
     OR COALESCE((result ->> 'activity_feed_deleted')::integer, -1) <> 0 THEN
    failures := array_append(failures,
      'a second immediate run deleted more rows: ' || result::text);
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RETENTION: % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- Closed to members: it is SECURITY DEFINER and it deletes rows.
DO $$
DECLARE
  failures text[] := '{}';
BEGIN
  IF has_function_privilege('anon', 'public.prune_old_records()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.prune_old_records()', 'EXECUTE') THEN
    failures := array_append(failures,
      'a member can call prune_old_records() -- that is a delete button on the league''s history');
  END IF;

  IF NOT has_function_privilege('service_role', 'public.prune_old_records()', 'EXECUTE') THEN
    failures := array_append(failures,
      'service_role cannot call prune_old_records() -- the scheduled job cannot run');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RETENTION: % PRIVILEGE CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'RETENTION: ALL CHECKS PASSED'; END $$;
