-- Actually expire challenges, which the app has been promising since May.
--
-- expire_stale_challenges() has existed since 20260507040125 and is correct.
-- Nothing ever scheduled it. Its only caller is the create-challenge edge
-- function -- the one operation it exists to unblock -- so a challenge nobody
-- answered sat at status='pending' until some unrelated player happened to
-- issue a challenge of their own.
--
-- What a member saw: the Rules screen says "A challenge expires if not answered
-- within 2 days". The Challenges screen counted down, hit zero, and then showed
-- "Expiring soon" indefinitely. And because respond-to-challenge gates on
-- status and never reads expires_at, the challenged player could still accept
-- -- or decline, taking a forfeit loss -- weeks after the window closed. With a
-- $5 match fee attached, that is a dispute, not a cosmetic bug.
--
-- Fifteen minutes matches the existing match-reminder-check cadence and bounds
-- how long an expired challenge stays actionable. respond-to-challenge also
-- calls the sweeper directly, so the bound on what a member can actually DO is
-- zero; this schedule is what keeps the ladder's stored state honest for
-- everyone reading it.
--
-- Idempotent: unschedule-then-schedule, so re-applying this is a no-op. Guarded
-- on pg_cron because CI replays every migration against a plain Postgres 17
-- that has no such extension.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'challenge-expiry-check') THEN
      PERFORM cron.unschedule('challenge-expiry-check');
    END IF;
    PERFORM cron.schedule(
      'challenge-expiry-check',
      '*/15 * * * *',
      $cron$ SELECT public.expire_stale_challenges(); $cron$
    );

    -- Already running in production, scheduled by hand in May 2026 as part of
    -- the batch PR #25 was meant to record. 20260813200000 restored the
    -- function and missed the job, so a database rebuilt from this repo had
    -- process_inactive_demotions() sitting there with nothing to call it.
    -- Written down here so the rebuild matches. Against production this
    -- re-creates the identical schedule and changes nothing.
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inactive-demotion-check') THEN
      PERFORM cron.unschedule('inactive-demotion-check');
    END IF;
    PERFORM cron.schedule(
      'inactive-demotion-check',
      '0 13 * * *',
      $cron$ SELECT public.process_inactive_demotions(); $cron$
    );

  END IF;
END $$;
