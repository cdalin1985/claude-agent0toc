-- process_inactive_demotions() throws the first time it demotes anybody.
--
-- rankings.position carries a UNIQUE constraint (rankings_position_key) that is
-- NOT deferrable, so Postgres checks it row by row as an UPDATE proceeds. The
-- function shifted the block in place:
--
--   UPDATE rankings SET position = position - 1
--    WHERE position > v_current_pos AND position <= v_new_pos;
--
-- The first row of that block sits at v_current_pos + 1 and is moved to
-- v_current_pos -- which the player being demoted still occupies, because they
-- are not moved until the next statement. Guaranteed duplicate key. Verified
-- against a table of the same shape on 2026-08-17: "duplicate key value
-- violates unique constraint".
--
-- It has never fired because it only runs when v_drops_owed > 0, and nobody has
-- yet been inactive for 30 days. It runs daily at 13:00 and has returned
-- demoted_count 0 every time, so the cron history looks healthy. The league
-- launches with 63 members who have never signed in; roughly a month later this
-- starts raising every day, and the Rules screen has meanwhile been promising
-- "extended inactivity can result in ladder demotion".
--
-- The fix is the pattern cascade_ranking_after_win already uses and has been
-- exercised in production: take the ranking lock, park the affected block at a
-- +1000 offset well clear of the live range, place the mover, then bring the
-- parked rows back down. No intermediate state ever collides.
--
-- Everything else about the function -- the 30-day window, two spots per
-- elapsed month, the cap at the bottom of the ladder, the activity_feed entry,
-- the jsonb return -- is unchanged.

CREATE OR REPLACE FUNCTION public.process_inactive_demotions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_player        RECORD;
  v_drops_owed    INTEGER;
  v_current_pos   INTEGER;
  v_new_pos       INTEGER;
  v_total_players INTEGER;
  v_count         INTEGER := 0;
BEGIN
  -- Same lock cascade_ranking_after_win takes. Demotions and match results both
  -- renumber the ladder; without this they can interleave and leave it
  -- inconsistent. Taken once for the whole sweep rather than per player.
  LOCK TABLE public.rankings IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO v_total_players FROM rankings;

  FOR v_player IN
    SELECT id, inactivated_at, full_name
    FROM players
    WHERE is_active = false
      AND inactivated_at IS NOT NULL
      AND inactivated_at <= NOW() - INTERVAL '30 days'
  LOOP
    v_drops_owed := floor(EXTRACT(EPOCH FROM (NOW() - v_player.inactivated_at)) / (86400 * 30)) * 2;

    IF v_drops_owed > 0 THEN
      SELECT position INTO v_current_pos FROM rankings WHERE player_id = v_player.id;
      v_new_pos := least(v_current_pos + v_drops_owed, v_total_players);

      IF v_new_pos > v_current_pos THEN
        -- 1. Park everyone between the old and new position, clear of the range
        --    the live ladder occupies.
        UPDATE rankings
           SET previous_position = position,
               position          = position + 1000,
               updated_at        = now()
         WHERE position > v_current_pos AND position <= v_new_pos;

        -- 2. Drop the inactive player into their new spot, now vacant.
        --    rank1_since is cleared unconditionally: this player is moving down
        --    the ladder, so they do not hold rank 1 afterwards either way.
        UPDATE rankings
           SET previous_position = v_current_pos,
               position          = v_new_pos,
               rank1_since       = NULL,
               updated_at        = now()
         WHERE player_id = v_player.id;

        -- 3. Bring the parked rows back, each one spot higher than they were.
        --    -1001 = undo the +1000 offset, then move up one.
        UPDATE rankings
           SET position    = position - 1001,
               rank1_since = CASE WHEN position - 1001 = 1 THEN now() ELSE rank1_since END,
               updated_at  = now()
         WHERE position BETWEEN (1000 + v_current_pos + 1) AND (1000 + v_new_pos);

        v_count := v_count + 1;

        INSERT INTO activity_feed (event_type, headline, actor_player_id)
        VALUES ('inactive_demotion',
                v_player.full_name || ' dropped ' || v_drops_owed || ' spots due to 30+ days of inactivity.',
                v_player.id);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('demoted_count', v_count, 'at', NOW());
END;
$function$;

-- CREATE OR REPLACE preserves the existing ACL, but state it anyway: this is a
-- SECURITY DEFINER function that renumbers the ladder, and 20260612150000 locks
-- it down behind an IF-the-function-exists guard that silently skips on a fresh
-- database. Repeating the REVOKEs here means the lockdown does not depend on
-- which migration happened to run first.
REVOKE EXECUTE ON FUNCTION public.process_inactive_demotions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_inactive_demotions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_inactive_demotions() FROM authenticated;
