-- The inactive demotion took two spots per DAY, not per 30 days.
--
-- The rule (README, "Inactive Players"): "Inactive more than 30 days -- you
-- drop two spots for every 30 days of inactivity."
--
-- What the function did:
--
--   v_drops_owed := floor(elapsed_seconds / (86400 * 30)) * 2;
--   v_new_pos    := least(v_current_pos + v_drops_owed, v_total_players);
--
-- v_drops_owed is derived purely from elapsed time and applied relative to
-- wherever the player currently sits. Nothing recorded that a demotion had
-- already happened. The job is scheduled '0 13 * * *' -- every day -- so for
-- the whole of days 30..59 it computed "2 owed" and moved the player two more
-- spots down from where yesterday's run had left them:
--
--   day 30   owed 2   #9  -> #11
--   day 31   owed 2   #11 -> #13
--   day 32   owed 2   #13 -> #15      ... and so on, to the bottom
--
-- A member who is owed 2 spots a month lost 2 a day, reaching last place in
-- about four weeks. At day 60 the rate doubles to 4/day, at day 90 to 6/day.
--
-- It has never fired. The function only acts once somebody has been inactive
-- 30 days and nobody had been, so it has returned demoted_count 0 on every run
-- since May and the cron history looks perfectly healthy. Both current inactive
-- members carry inactivated_at = 2026-08-21, so the first live run would have
-- landed around 2026-09-20.
--
-- The fix is a ledger. players.inactive_drops_applied records how far this
-- spell of inactivity has already moved them, so the function can ask for the
-- difference between what is owed and what has been taken rather than
-- recomputing the whole debt each run. Applying the same migration twice, or
-- the same day's cron twice, then moves nobody.
--
-- Why a column and not "derive it from the position": position changes for
-- reasons that have nothing to do with inactivity -- players above them retire,
-- someone below wins a challenge and climbs past. Only an explicit ledger can
-- tell "this player has already taken 4 of the 6 spots they owe" apart from
-- "this player drifted down 4 spots while inactive".

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS inactive_drops_applied INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.players.inactive_drops_applied IS
  'Spots this player has already been dropped during the CURRENT spell of inactivity. Reset to 0 on reactivation, alongside inactivated_at. process_inactive_demotions subtracts it from the spots owed, so a daily run cannot re-apply a debt it already settled.';

-- ---------------------------------------------------------------------------
-- Reset the ledger when the spell ends
-- ---------------------------------------------------------------------------
-- on_player_inactivation already clears inactivated_at on reactivation. The
-- ledger has exactly the same lifetime -- it counts drops within one spell --
-- so it is cleared in the same place. Miss this and a member who goes inactive,
-- comes back, and goes inactive again a year later starts their new spell
-- already "paid up" and never drops at all.
CREATE OR REPLACE FUNCTION public.on_player_inactivation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.is_active = false AND OLD.is_active = true THEN
    NEW.inactivated_at = NOW();
    NEW.inactive_drops_applied = 0;
  ELSIF NEW.is_active = true AND OLD.is_active = false THEN
    NEW.inactivated_at = NULL;
    NEW.inactive_drops_applied = 0;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Owe the difference, not the whole debt
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_inactive_demotions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_player        RECORD;
  v_drops_earned  INTEGER;
  v_drops_due     INTEGER;
  v_drops_taken   INTEGER;
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
    SELECT id, inactivated_at, full_name, inactive_drops_applied
    FROM players
    WHERE is_active = false
      AND inactivated_at IS NOT NULL
      AND inactivated_at <= NOW() - INTERVAL '30 days'
  LOOP
    -- Everything this spell has earned, and everything it has already been
    -- charged. The difference is what today's run may take.
    v_drops_earned := floor(EXTRACT(EPOCH FROM (NOW() - v_player.inactivated_at)) / (86400 * 30)) * 2;
    v_drops_due    := v_drops_earned - COALESCE(v_player.inactive_drops_applied, 0);

    IF v_drops_due > 0 THEN
      SELECT position INTO v_current_pos FROM rankings WHERE player_id = v_player.id;
      v_new_pos := least(v_current_pos + v_drops_due, v_total_players);

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

        -- Charge only what the ladder actually had room for. When least() caps
        -- the landing spot at the bottom, the uncharged remainder stays owed --
        -- so if the list later grows beneath them, the rest of the debt is
        -- still collected instead of being quietly forgiven.
        v_drops_taken := v_new_pos - v_current_pos;

        UPDATE players
           SET inactive_drops_applied = COALESCE(inactive_drops_applied, 0) + v_drops_taken
         WHERE id = v_player.id;

        v_count := v_count + 1;

        INSERT INTO activity_feed (event_type, headline, actor_player_id)
        VALUES ('inactive_demotion',
                v_player.full_name || ' dropped ' || v_drops_taken || ' spots due to 30+ days of inactivity.',
                v_player.id);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('demoted_count', v_count, 'at', NOW());
END;
$function$;

-- Unchanged, and re-asserted because CREATE OR REPLACE keeps existing grants
-- but this function renumbers the ladder and is SECURITY DEFINER, so the
-- lock-down is worth restating next to the definition rather than trusting a
-- migration from June to still be in force.
REVOKE ALL ON FUNCTION public.process_inactive_demotions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_inactive_demotions() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_inactive_demotions() TO service_role;

COMMENT ON FUNCTION public.process_inactive_demotions() IS
  'Drops inactive members 2 spots per completed 30 days, once. Charges the difference between spots earned and players.inactive_drops_applied, so the daily cron settles a debt rather than re-applying it; a capped landing at the bottom of the ladder leaves the remainder owed.';

-- ---------------------------------------------------------------------------
-- Backfill: nobody has been demoted yet, so nobody is owed a correction
-- ---------------------------------------------------------------------------
-- The function has returned demoted_count 0 on every run since May, and
-- activity_feed carries no 'inactive_demotion' rows, so no live player has been
-- moved by it. The DEFAULT 0 above is therefore already correct for every
-- existing row and there is nothing to reconstruct. Asserted rather than
-- assumed: if this repo is ever replayed against a database where the old
-- function DID demote somebody, that database needs a real backfill and should
-- not silently get this one.
DO $$
DECLARE
  v_demotions integer;
BEGIN
  SELECT count(*) INTO v_demotions FROM activity_feed WHERE event_type = 'inactive_demotion';
  IF v_demotions > 0 THEN
    RAISE WARNING
      'process_inactive_demotions has already moved players (% activity_feed rows). inactive_drops_applied defaulted to 0 for everyone, so those players may be demoted again for time already served -- reconstruct their ledger from the feed before the next cron run.',
      v_demotions;
  END IF;
END $$;
