-- Enforce the play window the README states but the app never applied.
--
-- Pre-match reminders are NOT here: PR #40 shipped a 24h + 1h reminder system
-- with its own dedupe log, and it is already running. An earlier draft of this
-- migration defined a competing send_match_reminders() scheduled under the SAME
-- cron job name, 'match-reminder-check'. Because this file sorts after theirs,
-- it would have unscheduled the working job and silently replaced two reminders
-- with one. Left out deliberately.
--
-- 1. "Once accepted, the match must be played within 10 days." respond-to-challenge
--    wrote challenges.match_deadline and nothing ever read it, so an accepted
--    challenge that never got played sat at status='scheduled' forever, blocking
--    both players from issuing or receiving any other challenge.
-- 2. "If you can't agree on a time: the challenge is a wash. No penalties for
--    either player." A wash still consumed one of the challenger's two weekly
--    challenges because create-challenge counted every row in the window. That
--    needs a way to tell a mutual scheduling failure apart from a withdrawal,
--    hence challenges.cancel_reason.
-- 3. Players are notified ahead of their match time.
--
-- Written defensively (IF NOT EXISTS / CREATE OR REPLACE / guarded DO blocks)
-- because production carries objects this repo's migration history does not
-- describe, and this must apply cleanly to both.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

-- These three exist in production but appear nowhere in this repo's migration
-- history -- they were added by migrations production has and these files do
-- not. A database built from this repo alone therefore lacks them, and the
-- enforcement below reads match_deadline directly. IF NOT EXISTS makes each a
-- no-op against production while making a fresh build correct.
ALTER TABLE public.league_settings
  ADD COLUMN IF NOT EXISTS match_play_days INTEGER NOT NULL DEFAULT 10;

ALTER TABLE public.league_settings
  ADD COLUMN IF NOT EXISTS challenge_response_hours INTEGER NOT NULL DEFAULT 48;

-- Written by respond-to-challenge on acceptance; read by expire_overdue_matches.
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS match_deadline TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- 'wash'      - a mutual scheduling failure. Per the README this carries no
--               penalty, so it does not consume a weekly challenge.
-- 'withdrawn' - the challenger pulled their own challenge, or washed one that
--               was never accepted. Nothing was ever scheduled, so there was no
--               time to fail to agree on; this still consumes the challenge.
-- 'overdue'   - accepted but never played inside the play window. Treated as a
--               wash for penalty purposes (see expire_overdue_matches).
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

ALTER TABLE public.challenges
  DROP CONSTRAINT IF EXISTS challenges_cancel_reason_check;
ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_cancel_reason_check
  CHECK (cancel_reason IS NULL OR cancel_reason IN ('wash', 'withdrawn', 'overdue'));

-- Both cron functions below scan on these.
CREATE INDEX IF NOT EXISTS idx_challenges_match_deadline
  ON public.challenges(match_deadline)
  WHERE status = 'scheduled';

-- ---------------------------------------------------------------------------
-- Rule: a scheduled match not played inside the play window is a wash
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_overdue_matches()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired INTEGER := 0;
BEGIN
  -- Only challenges whose match never got under way. Once a match is
  -- in_progress/submitted/confirming/disputed the players did meet, and the
  -- deadline stops being relevant -- confirmation or dispute resolution owns
  -- it from there. Cancelling those would destroy a played result.
  --
  -- The guard is NOT EXISTS(match beyond 'scheduled') rather than
  -- EXISTS(match = 'scheduled'), so it also catches a challenge left at
  -- 'scheduled' with NO match row at all. That happens if the accept path dies
  -- between writing the challenge and inserting the match, and it is exactly
  -- the stuck state this function exists to clear.
  WITH overdue AS (
    UPDATE public.challenges c
       SET status        = 'cancelled',
           cancel_reason = 'overdue',
           updated_at    = NOW()
     WHERE c.status         = 'scheduled'
       AND c.match_deadline IS NOT NULL
       AND c.match_deadline < NOW()
       AND NOT EXISTS (
             SELECT 1 FROM public.matches m
              WHERE m.challenge_id = c.id AND m.status <> 'scheduled'
           )
    RETURNING c.id, c.challenger_id, c.challenged_id, c.discipline
  ),
  named AS (
    SELECT o.id, o.challenger_id, o.challenged_id, o.discipline,
           cr.full_name AS challenger_name,
           cd.full_name AS challenged_name
      FROM overdue o
      JOIN public.players cr ON cr.id = o.challenger_id
      JOIN public.players cd ON cd.id = o.challenged_id
  ),
  closed_matches AS (
    UPDATE public.matches m
       SET status     = 'resolved',
           updated_at = NOW()
      FROM overdue o
     WHERE m.challenge_id = o.id
       AND m.status       = 'scheduled'
    RETURNING m.id
  ),
  logged AS (
    INSERT INTO public.activity_feed (event_type, headline, detail, actor_player_id)
    SELECT
      'challenge_cancelled',
      n.challenger_name || ' vs ' || n.challenged_name || ' was not played in time -- ruled a wash.',
      n.discipline || ' - no ranking change, no cooldown, no challenge used',
      NULL
    FROM named n
    RETURNING id
  ),
  notified AS (
    INSERT INTO public.notifications (player_id, type, title, body, reference_id, reference_type)
    SELECT
      p.player_id,
      'challenge_expired',
      'Match window closed',
      'Your ' || n.discipline || ' match with ' || p.opponent_name
        || ' was not played in time, so it is a wash. No penalty for either of you, and it did not use up a challenge.',
      n.id,
      'challenge'
    FROM named n
    CROSS JOIN LATERAL (VALUES (n.challenger_id, n.challenged_name),
                               (n.challenged_id, n.challenger_name)) AS p(player_id, opponent_name)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired FROM overdue;

  RETURN v_expired;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_overdue_matches() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_overdue_matches() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_overdue_matches() TO service_role;

COMMENT ON FUNCTION public.expire_overdue_matches() IS
  'Rules any challenge whose match_deadline has passed without the match ever starting as a no-penalty wash (cancel_reason=overdue), closes the unplayed match, and notifies both players. Skips challenges whose match reached in_progress or later. Idempotent: a cancelled challenge no longer matches. Returns rows affected.';

-- ---------------------------------------------------------------------------
-- Schedules, following the existing guarded pg_cron pattern
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'overdue-match-check') THEN
      PERFORM cron.unschedule('overdue-match-check');
    END IF;
    -- 13:30 UTC, just after the existing inactive-demotion-check at 13:00.
    PERFORM cron.schedule(
      'overdue-match-check',
      '30 13 * * *',
      $cron$ SELECT public.expire_overdue_matches(); $cron$
    );

  END IF;
END $$;
