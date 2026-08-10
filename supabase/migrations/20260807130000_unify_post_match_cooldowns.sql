-- One implementation of the post-match cooldown rule.
--
-- The rule was implemented three times, in three languages, with three
-- different answers:
--   submit-result                   loser always; climber after 20260807120000
--   apply_challenge_decline_forfeit decliner only -- the challenger who took
--                                   their spot by decline got nothing
--   resolve-dispute                 nobody, for either player
--
-- The decline gap reopens exactly the loophole 20260807120000 closed, by a
-- different door: challenge up, opponent declines, you climb, challenge up again
-- immediately. README makes no exception for how the spot was taken:
-- "You take their spot... You must wait 24 hours before challenging up again."
--
-- All three paths now call apply_post_match_cooldowns.

-- ---------------------------------------------------------------------------
-- The shared helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_post_match_cooldowns(
  p_loser_id   uuid,
  p_climber_id uuid DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours               integer;
  v_expires             timestamptz;
  v_loser_cooldown_id   uuid;
  v_climber_cooldown_id uuid;
BEGIN
  SELECT cooldown_hours INTO v_hours
    FROM public.league_settings
   ORDER BY updated_at DESC, id
   LIMIT 1;
  v_hours := COALESCE(v_hours, 24);

  -- Returned positionally: element 1 is the loser's cooldown, element 2 the
  -- climber's. Either may be NULL.
  IF v_hours <= 0 THEN
    RETURN ARRAY[NULL, NULL]::uuid[];
  END IF;

  v_expires := now() + make_interval(hours => v_hours);

  IF p_loser_id IS NOT NULL THEN
    INSERT INTO public.cooldowns(player_id, type, expires_at)
    VALUES (p_loser_id, 'post_match', v_expires)
    RETURNING id INTO v_loser_cooldown_id;
  END IF;

  -- A player cannot be both, but guard anyway rather than write two rows for
  -- one person and trip the single-active-cooldown read in create-challenge.
  IF p_climber_id IS NOT NULL AND p_climber_id IS DISTINCT FROM p_loser_id THEN
    INSERT INTO public.cooldowns(player_id, type, expires_at)
    VALUES (p_climber_id, 'post_match', v_expires)
    RETURNING id INTO v_climber_cooldown_id;
  END IF;

  RETURN ARRAY[v_loser_cooldown_id, v_climber_cooldown_id]::uuid[];
END;
$$;

REVOKE ALL ON FUNCTION public.apply_post_match_cooldowns(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_post_match_cooldowns(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_post_match_cooldowns(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.apply_post_match_cooldowns(uuid, uuid) IS
  'Single implementation of the README post-match cooldown: the loser always waits, and a winner who climbed waits too, while a successful defender does not. Pass the climber as NULL on a defence. Returns ARRAY[loser_cooldown_id, climber_cooldown_id]; both are NULL when league_settings.cooldown_hours is 0 or less. Called by submit-result, resolve-dispute and apply_challenge_decline_forfeit.';

-- ---------------------------------------------------------------------------
-- Track the second cooldown so a reversed decline can unwind both
-- ---------------------------------------------------------------------------

-- challenge_forfeiture_events.cooldown_id is a single uuid consumed by
-- reverse_challenge_decline_forfeit. Without a second column, reversing a
-- decline would leave the challenger's new cooldown orphaned and still active.
ALTER TABLE public.challenge_forfeiture_events
  ADD COLUMN IF NOT EXISTS challenger_cooldown_id uuid REFERENCES public.cooldowns(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.challenge_forfeiture_events.challenger_cooldown_id IS
  'Cooldown written for the challenger when a decline moved them up the list. NULL when the decline caused no ranking movement. Deleted by reverse_challenge_decline_forfeit alongside cooldown_id.';

-- ---------------------------------------------------------------------------
-- Decline-forfeit: give the climbing challenger their cooldown
-- ---------------------------------------------------------------------------
--
-- Reproduced from the live definition with two changes: the inline cooldown
-- INSERT becomes a call to apply_post_match_cooldowns, and the resulting
-- challenger cooldown id is recorded on the forfeiture event.

CREATE OR REPLACE FUNCTION public.apply_challenge_decline_forfeit(
  p_challenge_id uuid,
  p_actor_profile_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_challenge public.challenges%ROWTYPE;
  v_event_id uuid;
  v_cooldown_id uuid;
  v_challenger_cooldown_id uuid;
  v_cooldown_ids uuid[];
  v_challenger_climbed boolean := false;
  v_activity_event_id uuid;
  v_notification_ids uuid[] := '{}'::uuid[];
  v_challenger_previous_position integer;
  v_forfeiting_previous_position integer;
  v_challenger_new_position integer;
  v_forfeiting_new_position integer;
  v_challenger_name text;
  v_forfeiting_name text;
  v_challenger_rank1_since timestamptz;
  v_forfeiting_rank1_since timestamptz;
  v_challenger_season_before jsonb := '{}'::jsonb;
  v_forfeiting_season_before jsonb := '{}'::jsonb;
  v_challenger_discipline_before jsonb := '{}'::jsonb;
  v_forfeiting_discipline_before jsonb := '{}'::jsonb;
BEGIN
  LOCK TABLE public.rankings IN SHARE ROW EXCLUSIVE MODE;

  SELECT * INTO v_challenge FROM public.challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Challenge % not found', p_challenge_id; END IF;
  IF v_challenge.status <> 'pending' THEN
    RAISE EXCEPTION 'Challenge % is %, not pending', p_challenge_id, v_challenge.status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.challenge_forfeiture_events WHERE challenge_id = p_challenge_id AND reversed_at IS NULL) THEN
    RAISE EXCEPTION 'Challenge % already has an active forfeit event', p_challenge_id;
  END IF;

  SELECT position, rank1_since INTO v_challenger_previous_position, v_challenger_rank1_since
  FROM public.rankings WHERE player_id = v_challenge.challenger_id;
  SELECT position, rank1_since INTO v_forfeiting_previous_position, v_forfeiting_rank1_since
  FROM public.rankings WHERE player_id = v_challenge.challenged_id;
  SELECT full_name INTO v_challenger_name FROM public.players WHERE id = v_challenge.challenger_id;
  SELECT full_name INTO v_forfeiting_name FROM public.players WHERE id = v_challenge.challenged_id;

  INSERT INTO public.player_season_stats(player_id)
  VALUES (v_challenge.challenger_id), (v_challenge.challenged_id)
  ON CONFLICT (player_id) DO NOTHING;

  INSERT INTO public.player_discipline_stats(player_id, discipline)
  VALUES (v_challenge.challenger_id, v_challenge.discipline), (v_challenge.challenged_id, v_challenge.discipline)
  ON CONFLICT (player_id, discipline) DO NOTHING;

  SELECT to_jsonb(stats) INTO v_challenger_season_before
  FROM public.player_season_stats stats WHERE stats.player_id = v_challenge.challenger_id;
  SELECT to_jsonb(stats) INTO v_forfeiting_season_before
  FROM public.player_season_stats stats WHERE stats.player_id = v_challenge.challenged_id;
  SELECT to_jsonb(stats) INTO v_challenger_discipline_before
  FROM public.player_discipline_stats stats
  WHERE stats.player_id = v_challenge.challenger_id AND stats.discipline = v_challenge.discipline;
  SELECT to_jsonb(stats) INTO v_forfeiting_discipline_before
  FROM public.player_discipline_stats stats
  WHERE stats.player_id = v_challenge.challenged_id AND stats.discipline = v_challenge.discipline;

  UPDATE public.challenges
  SET status = 'forfeited',
      response_message = COALESCE(response_message, 'Declined challenge counted as a forfeit.'),
      updated_at = now()
  WHERE id = p_challenge_id;

  -- The same condition gates the cascade and the challenger's cooldown: they
  -- only wait if declining actually moved them up.
  v_challenger_climbed := v_challenger_previous_position IS NOT NULL
    AND v_forfeiting_previous_position IS NOT NULL
    AND v_challenger_previous_position > v_forfeiting_previous_position;

  IF v_challenger_climbed THEN
    PERFORM public.cascade_ranking_after_win(v_challenge.challenger_id, v_challenge.challenged_id);
  END IF;

  SELECT position INTO v_challenger_new_position FROM public.rankings WHERE player_id = v_challenge.challenger_id;
  SELECT position INTO v_forfeiting_new_position FROM public.rankings WHERE player_id = v_challenge.challenged_id;

  UPDATE public.player_season_stats
  SET wins = wins + 1, forfeit_wins = forfeit_wins + 1, challenger_wins = challenger_wins + 1,
      current_streak = CASE WHEN current_streak >= 0 THEN current_streak + 1 ELSE 1 END,
      best_streak = GREATEST(best_streak, CASE WHEN current_streak >= 0 THEN current_streak + 1 ELSE 1 END),
      best_rank_achieved = CASE
        WHEN v_challenger_new_position IS NULL THEN best_rank_achieved
        WHEN best_rank_achieved IS NULL OR v_challenger_new_position < best_rank_achieved THEN v_challenger_new_position
        ELSE best_rank_achieved END,
      updated_at = now()
  WHERE player_id = v_challenge.challenger_id;

  UPDATE public.player_season_stats
  SET forfeits = forfeits + 1, current_streak = 0, updated_at = now()
  WHERE player_id = v_challenge.challenged_id;

  UPDATE public.player_discipline_stats
  SET wins = wins + 1, forfeit_wins = forfeit_wins + 1, challenger_wins = challenger_wins + 1,
      current_streak = CASE WHEN current_streak >= 0 THEN current_streak + 1 ELSE 1 END,
      best_streak = GREATEST(best_streak, CASE WHEN current_streak >= 0 THEN current_streak + 1 ELSE 1 END),
      updated_at = now()
  WHERE player_id = v_challenge.challenger_id AND discipline = v_challenge.discipline;

  UPDATE public.player_discipline_stats
  SET forfeits = forfeits + 1, current_streak = 0, updated_at = now()
  WHERE player_id = v_challenge.challenged_id AND discipline = v_challenge.discipline;

  -- Was: an inline INSERT for the decliner only, which left a challenger who
  -- climbed by decline free to challenge up again immediately.
  v_cooldown_ids := public.apply_post_match_cooldowns(
    v_challenge.challenged_id,
    CASE WHEN v_challenger_climbed THEN v_challenge.challenger_id END
  );
  v_cooldown_id            := v_cooldown_ids[1];
  v_challenger_cooldown_id := v_cooldown_ids[2];

  INSERT INTO public.activity_feed(event_type, headline, detail, actor_player_id)
  VALUES (
    'challenge_forfeited',
    COALESCE(v_challenger_name, 'Challenger') || ' won by forfeit after ' ||
      COALESCE(v_forfeiting_name, 'the challenged player') || ' declined the challenge.',
    'Discipline: ' || v_challenge.discipline || '. Race to ' || v_challenge.race_length ||
      '. Ranking moved from #' || COALESCE(v_challenger_previous_position::text, '?') ||
      ' vs #' || COALESCE(v_forfeiting_previous_position::text, '?') ||
      ' to #' || COALESCE(v_challenger_new_position::text, '?') ||
      ' vs #' || COALESCE(v_forfeiting_new_position::text, '?') ||
      '. No match fee was charged.',
    v_challenge.challenged_id
  )
  RETURNING id INTO v_activity_event_id;

  WITH inserted_notifications AS (
    INSERT INTO public.notifications(player_id, type, title, body, reference_id, reference_type)
    VALUES
      (v_challenge.challenger_id, 'challenge_forfeit_win', 'Challenge won by forfeit',
        COALESCE(v_forfeiting_name, 'Your opponent') || ' declined your ' || v_challenge.discipline ||
        ' challenge. Your record and ranking have been updated.' ||
        CASE WHEN v_challenger_cooldown_id IS NOT NULL
             THEN ' You took their spot, so you wait out the usual cooldown before challenging up again.'
             ELSE '' END, p_challenge_id, 'challenge'),
      (v_challenge.challenged_id, 'challenge_forfeited', 'Challenge declined as forfeit',
        'Declining ' || COALESCE(v_challenger_name, 'the challenger') || '''s ' || v_challenge.discipline ||
        ' challenge was recorded as a forfeit. No match fee was charged.', p_challenge_id, 'challenge')
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_notification_ids FROM inserted_notifications;

  INSERT INTO public.audit_events(actor_profile_id, action, target_type, target_id, detail)
  VALUES (p_actor_profile_id, 'challenge_decline_forfeit_applied', 'challenge', p_challenge_id,
    jsonb_build_object(
      'challenger_id', v_challenge.challenger_id,
      'forfeiting_player_id', v_challenge.challenged_id,
      'challenger_previous_position', v_challenger_previous_position,
      'forfeiting_previous_position', v_forfeiting_previous_position,
      'challenger_new_position', v_challenger_new_position,
      'forfeiting_new_position', v_forfeiting_new_position,
      'cooldown_id', v_cooldown_id,
      'challenger_cooldown_id', v_challenger_cooldown_id,
      'activity_event_id', v_activity_event_id,
      'notification_ids', v_notification_ids
    ));

  INSERT INTO public.challenge_forfeiture_events(
    challenge_id, challenger_id, forfeiting_player_id, winner_id, loser_id,
    previous_challenge_status, challenger_previous_position, forfeiting_previous_position,
    challenger_new_position, forfeiting_new_position, cooldown_id, challenger_cooldown_id,
    activity_event_id, notification_ids, metadata
  )
  VALUES (
    p_challenge_id, v_challenge.challenger_id, v_challenge.challenged_id,
    v_challenge.challenger_id, v_challenge.challenged_id, v_challenge.status,
    v_challenger_previous_position, v_forfeiting_previous_position,
    v_challenger_new_position, v_forfeiting_new_position,
    v_cooldown_id, v_challenger_cooldown_id, v_activity_event_id, v_notification_ids,
    jsonb_build_object(
      'actor_profile_id', p_actor_profile_id,
      'discipline', v_challenge.discipline,
      'race_length', v_challenge.race_length,
      'previous_response_message', v_challenge.response_message,
      'challenger_rank1_since_before', v_challenger_rank1_since,
      'forfeiting_rank1_since_before', v_forfeiting_rank1_since,
      'challenger_season_before', v_challenger_season_before,
      'forfeiting_season_before', v_forfeiting_season_before,
      'challenger_discipline_before', v_challenger_discipline_before,
      'forfeiting_discipline_before', v_forfeiting_discipline_before
    ))
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_challenge_decline_forfeit(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_challenge_decline_forfeit(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_challenge_decline_forfeit(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Reversal: unwind both cooldowns
-- ---------------------------------------------------------------------------
--
-- Reproduced from the live definition with one change: the challenger's
-- cooldown is deleted alongside the decliner's. Without it, reversing a decline
-- would leave the challenger blocked from challenging up by a cooldown for a
-- forfeit that no longer exists.

CREATE OR REPLACE FUNCTION public.reverse_challenge_decline_forfeit(
  p_challenge_id uuid,
  p_actor_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_challenge public.challenges%ROWTYPE;
  v_event public.challenge_forfeiture_events%ROWTYPE;
  v_challenger_current_position integer;
  v_forfeiting_current_position integer;
  v_challenger_name text;
  v_forfeiting_name text;
  v_reversal_activity_event_id uuid;
  v_reversal_notification_ids uuid[] := '{}'::uuid[];
  v_challenger_season_before jsonb;
  v_forfeiting_season_before jsonb;
  v_challenger_discipline_before jsonb;
  v_forfeiting_discipline_before jsonb;
  v_expected_challenger_season_streak integer;
  v_expected_challenger_discipline_streak integer;
  v_expected_challenger_best_rank integer;
BEGIN
  IF p_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'Actor profile id is required to reverse a forfeit';
  END IF;

  LOCK TABLE public.rankings IN SHARE ROW EXCLUSIVE MODE;

  SELECT * INTO v_event FROM public.challenge_forfeiture_events
  WHERE challenge_id = p_challenge_id AND reversed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge % has no active forfeit event to reverse', p_challenge_id;
  END IF;

  SELECT * INTO v_challenge FROM public.challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge % not found while reversing forfeit', p_challenge_id;
  END IF;

  IF v_challenge.status <> 'forfeited'
     OR v_challenge.challenger_id <> v_event.challenger_id
     OR v_challenge.challenged_id <> v_event.forfeiting_player_id
     OR v_challenge.response_message IS DISTINCT FROM COALESCE(
       v_event.metadata->>'previous_response_message',
       'Declined challenge counted as a forfeit.'
     ) THEN
    RAISE EXCEPTION 'Cannot automatically reverse challenge %, challenge row changed after the forfeit', p_challenge_id;
  END IF;

  SELECT position INTO v_challenger_current_position FROM public.rankings WHERE player_id = v_event.challenger_id;
  SELECT position INTO v_forfeiting_current_position FROM public.rankings WHERE player_id = v_event.forfeiting_player_id;

  IF v_challenger_current_position IS DISTINCT FROM v_event.challenger_new_position
     OR v_forfeiting_current_position IS DISTINCT FROM v_event.forfeiting_new_position THEN
    RAISE EXCEPTION 'Cannot automatically reverse challenge %, rankings changed after the forfeit', p_challenge_id;
  END IF;

  v_challenger_season_before := v_event.metadata->'challenger_season_before';
  v_forfeiting_season_before := v_event.metadata->'forfeiting_season_before';
  v_challenger_discipline_before := v_event.metadata->'challenger_discipline_before';
  v_forfeiting_discipline_before := v_event.metadata->'forfeiting_discipline_before';

  IF v_challenger_season_before IS NULL OR v_forfeiting_season_before IS NULL
     OR v_challenger_discipline_before IS NULL OR v_forfeiting_discipline_before IS NULL THEN
    RAISE EXCEPTION 'Cannot automatically reverse challenge %, forfeit stat snapshots are missing', p_challenge_id;
  END IF;

  v_expected_challenger_season_streak := CASE
    WHEN (v_challenger_season_before->>'current_streak')::integer >= 0
    THEN (v_challenger_season_before->>'current_streak')::integer + 1 ELSE 1 END;
  v_expected_challenger_discipline_streak := CASE
    WHEN (v_challenger_discipline_before->>'current_streak')::integer >= 0
    THEN (v_challenger_discipline_before->>'current_streak')::integer + 1 ELSE 1 END;
  v_expected_challenger_best_rank := CASE
    WHEN v_event.challenger_new_position IS NULL THEN (v_challenger_season_before->>'best_rank_achieved')::integer
    WHEN (v_challenger_season_before->>'best_rank_achieved')::integer IS NULL THEN v_event.challenger_new_position
    WHEN v_event.challenger_new_position < (v_challenger_season_before->>'best_rank_achieved')::integer THEN v_event.challenger_new_position
    ELSE (v_challenger_season_before->>'best_rank_achieved')::integer END;

  IF NOT EXISTS (
    SELECT 1 FROM public.player_season_stats WHERE player_id = v_event.challenger_id
      AND wins IS NOT DISTINCT FROM (v_challenger_season_before->>'wins')::integer + 1
      AND forfeit_wins IS NOT DISTINCT FROM (v_challenger_season_before->>'forfeit_wins')::integer + 1
      AND challenger_wins IS NOT DISTINCT FROM (v_challenger_season_before->>'challenger_wins')::integer + 1
      AND current_streak IS NOT DISTINCT FROM v_expected_challenger_season_streak
      AND best_streak IS NOT DISTINCT FROM GREATEST((v_challenger_season_before->>'best_streak')::integer, v_expected_challenger_season_streak)
      AND best_rank_achieved IS NOT DISTINCT FROM v_expected_challenger_best_rank
  ) THEN RAISE EXCEPTION 'Cannot automatically reverse challenge %, challenger season stats changed after the forfeit', p_challenge_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.player_season_stats WHERE player_id = v_event.forfeiting_player_id
      AND forfeits IS NOT DISTINCT FROM (v_forfeiting_season_before->>'forfeits')::integer + 1
      AND current_streak IS NOT DISTINCT FROM 0
  ) THEN RAISE EXCEPTION 'Cannot automatically reverse challenge %, forfeiting player season stats changed after the forfeit', p_challenge_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.player_discipline_stats WHERE player_id = v_event.challenger_id
      AND discipline = v_event.metadata->>'discipline'
      AND wins IS NOT DISTINCT FROM (v_challenger_discipline_before->>'wins')::integer + 1
      AND forfeit_wins IS NOT DISTINCT FROM (v_challenger_discipline_before->>'forfeit_wins')::integer + 1
      AND challenger_wins IS NOT DISTINCT FROM (v_challenger_discipline_before->>'challenger_wins')::integer + 1
      AND current_streak IS NOT DISTINCT FROM v_expected_challenger_discipline_streak
      AND best_streak IS NOT DISTINCT FROM GREATEST((v_challenger_discipline_before->>'best_streak')::integer, v_expected_challenger_discipline_streak)
  ) THEN RAISE EXCEPTION 'Cannot automatically reverse challenge %, challenger discipline stats changed after the forfeit', p_challenge_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.player_discipline_stats WHERE player_id = v_event.forfeiting_player_id
      AND discipline = v_event.metadata->>'discipline'
      AND forfeits IS NOT DISTINCT FROM (v_forfeiting_discipline_before->>'forfeits')::integer + 1
      AND current_streak IS NOT DISTINCT FROM 0
  ) THEN RAISE EXCEPTION 'Cannot automatically reverse challenge %, forfeiting player discipline stats changed after the forfeit', p_challenge_id;
  END IF;

  IF v_event.challenger_previous_position IS NOT NULL AND v_event.challenger_new_position IS NOT NULL
     AND v_event.challenger_previous_position <> v_event.challenger_new_position THEN
    UPDATE public.rankings SET previous_position = position, position = position + 1000, updated_at = now()
    WHERE position BETWEEN v_event.challenger_new_position AND v_event.challenger_previous_position;

    UPDATE public.rankings
    SET previous_position = v_event.challenger_new_position, position = v_event.challenger_previous_position,
        rank1_since = (v_event.metadata->>'challenger_rank1_since_before')::timestamptz, updated_at = now()
    WHERE player_id = v_event.challenger_id;

    UPDATE public.rankings SET position = position - 1001, updated_at = now()
    WHERE position BETWEEN (1000 + v_event.challenger_new_position + 1) AND (1000 + v_event.challenger_previous_position);

    UPDATE public.rankings
    SET rank1_since = (v_event.metadata->>'forfeiting_rank1_since_before')::timestamptz, updated_at = now()
    WHERE player_id = v_event.forfeiting_player_id;
  END IF;

  UPDATE public.challenges
  SET status = v_event.previous_challenge_status,
      response_message = v_event.metadata->>'previous_response_message', updated_at = now()
  WHERE id = p_challenge_id;

  IF v_event.cooldown_id IS NOT NULL THEN
    DELETE FROM public.cooldowns WHERE id = v_event.cooldown_id;
  END IF;

  -- Added: the challenger's cooldown, written when the decline moved them up.
  -- Leaving it would block them from challenging up over a forfeit that has
  -- just been undone.
  IF v_event.challenger_cooldown_id IS NOT NULL THEN
    DELETE FROM public.cooldowns WHERE id = v_event.challenger_cooldown_id;
  END IF;

  UPDATE public.player_season_stats
  SET wins = (v_challenger_season_before->>'wins')::integer,
      forfeit_wins = (v_challenger_season_before->>'forfeit_wins')::integer,
      challenger_wins = (v_challenger_season_before->>'challenger_wins')::integer,
      current_streak = (v_challenger_season_before->>'current_streak')::integer,
      best_streak = (v_challenger_season_before->>'best_streak')::integer,
      best_rank_achieved = (v_challenger_season_before->>'best_rank_achieved')::integer,
      updated_at = now()
  WHERE player_id = v_event.challenger_id;

  UPDATE public.player_season_stats
  SET forfeits = (v_forfeiting_season_before->>'forfeits')::integer,
      current_streak = (v_forfeiting_season_before->>'current_streak')::integer, updated_at = now()
  WHERE player_id = v_event.forfeiting_player_id;

  UPDATE public.player_discipline_stats
  SET wins = (v_challenger_discipline_before->>'wins')::integer,
      forfeit_wins = (v_challenger_discipline_before->>'forfeit_wins')::integer,
      challenger_wins = (v_challenger_discipline_before->>'challenger_wins')::integer,
      current_streak = (v_challenger_discipline_before->>'current_streak')::integer,
      best_streak = (v_challenger_discipline_before->>'best_streak')::integer, updated_at = now()
  WHERE player_id = v_event.challenger_id AND discipline = v_event.metadata->>'discipline';

  UPDATE public.player_discipline_stats
  SET forfeits = (v_forfeiting_discipline_before->>'forfeits')::integer,
      current_streak = (v_forfeiting_discipline_before->>'current_streak')::integer, updated_at = now()
  WHERE player_id = v_event.forfeiting_player_id AND discipline = v_event.metadata->>'discipline';

  SELECT full_name INTO v_challenger_name FROM public.players WHERE id = v_event.challenger_id;
  SELECT full_name INTO v_forfeiting_name FROM public.players WHERE id = v_event.forfeiting_player_id;

  INSERT INTO public.activity_feed(event_type, headline, detail, actor_player_id)
  VALUES ('challenge_forfeit_reversed',
    'Accidental decline reversed for ' || COALESCE(v_challenger_name, 'the challenger') ||
      ' vs ' || COALESCE(v_forfeiting_name, 'the challenged player') || '.',
    'The challenge is pending again. Forfeit stats, cooldown, and immediate ranking movement were reversed by an admin.',
    v_event.forfeiting_player_id)
  RETURNING id INTO v_reversal_activity_event_id;

  WITH inserted_notifications AS (
    INSERT INTO public.notifications(player_id, type, title, body, reference_id, reference_type)
    VALUES
      (v_event.challenger_id, 'challenge_forfeit_reversed', 'Decline reversed',
        'An admin reversed the accidental decline. Your challenge against ' ||
        COALESCE(v_forfeiting_name, 'the challenged player') || ' is pending again.',
        p_challenge_id, 'challenge'),
      (v_event.forfeiting_player_id, 'challenge_forfeit_reversed', 'Decline reversed',
        'An admin reversed the accidental decline. ' ||
        COALESCE(v_challenger_name, 'The challenger') || '''s challenge is pending again.',
        p_challenge_id, 'challenge')
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_reversal_notification_ids FROM inserted_notifications;

  UPDATE public.challenge_forfeiture_events
  SET reversed_at = now(), reversed_by_profile_id = p_actor_profile_id,
      metadata = metadata || jsonb_build_object(
        'reversal_activity_event_id', v_reversal_activity_event_id,
        'reversal_notification_ids', v_reversal_notification_ids)
  WHERE id = v_event.id;

  INSERT INTO public.audit_events(actor_profile_id, action, target_type, target_id, detail)
  VALUES (p_actor_profile_id, 'challenge_decline_forfeit_reversed', 'challenge', p_challenge_id,
    jsonb_build_object(
      'forfeiture_event_id', v_event.id,
      'challenger_id', v_event.challenger_id,
      'forfeiting_player_id', v_event.forfeiting_player_id,
      'reversal_activity_event_id', v_reversal_activity_event_id,
      'reversal_notification_ids', v_reversal_notification_ids
    ));
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_challenge_decline_forfeit(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_challenge_decline_forfeit(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_challenge_decline_forfeit(uuid, uuid) TO service_role;
