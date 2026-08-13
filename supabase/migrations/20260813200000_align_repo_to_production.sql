-- Make this repo able to rebuild production.
--
-- It could not. Production records 69 applied migrations; this repo holds 41
-- files. Most of the 28-version gap is duplicate re-applications of migrations
-- the repo already has, under different timestamps -- harmless. The rest is
-- real schema that exists in production and that no file here creates.
--
-- The largest piece is the player activation system: PR #25 ("Backfill
-- production Supabase migrations") carried it, was applied to production by
-- hand in May 2026, and was then closed unmerged in June. The database moved
-- and the repo did not. That is why a rehearsal of 20260813180000 failed on
-- 2026-08-13 with "column p.activated_at does not exist" -- CI was testing
-- against a schema that was not production's.
--
-- This migration is deliberately a NO-OP against production and load-bearing
-- against a fresh database. Every statement is idempotent, and each object's
-- shape was read back out of production rather than reconstructed from memory.
--
-- Two of the fixes below are not "the repo is missing something". They are
-- "the repo would actively undo a security decision production already made".
-- Those are the treasury and avatar policies in section 5. On a rebuild, the
-- earlier migrations recreate the permissive originals; this migration, which
-- sorts last, puts production's stricter answer back.
--
-- Why one file instead of recovering 28: the lost migrations are not
-- recoverable as history -- several were applied straight to the database and
-- never existed as files, and eleven of the 28 are re-runs whose files we
-- already have. Reconstructing a fake history would assert a sequence of
-- events that did not happen. Recording the end state honestly, in one file
-- that says where it came from, is the truthful version.

-- ---------------------------------------------------------------------------
-- 1. Player activation tracking (production versions 20260521070416/425/534)
-- ---------------------------------------------------------------------------
-- Two timestamps and two BEFORE UPDATE triggers that maintain them. Nothing in
-- the app reads these columns today; process_inactive_demotions (section 2)
-- does, and it is the only consumer.

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS activated_at   TIMESTAMPTZ;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS inactivated_at TIMESTAMPTZ;

-- search_path is empty in production, not 'public'. Preserved rather than
-- "corrected": these bodies only touch NEW.* and NOW(), so pg_catalog's
-- implicit presence is enough, and an empty search_path is the stricter
-- setting. Changing it here would be a silent behaviour change smuggled into
-- an alignment migration.
CREATE OR REPLACE FUNCTION public.on_player_activation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.is_active = true AND OLD.is_active = false THEN
    NEW.activated_at = NOW();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.on_player_inactivation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.is_active = false AND OLD.is_active = true THEN
    NEW.inactivated_at = NOW();
  ELSIF NEW.is_active = true AND OLD.is_active = false THEN
    NEW.inactivated_at = NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS track_player_activation_trigger ON public.players;
CREATE TRIGGER track_player_activation_trigger
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.on_player_activation();

DROP TRIGGER IF EXISTS track_player_inactivation_trigger ON public.players;
CREATE TRIGGER track_player_inactivation_trigger
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.on_player_inactivation();

-- ---------------------------------------------------------------------------
-- 2. process_inactive_demotions (production version 20260521070549)
-- ---------------------------------------------------------------------------
-- ORDERING TRAP, and the reason this section ends in REVOKEs.
--
-- 20260612150000_lock_down_process_inactive_demotions.sql locks this function
-- down, but wraps itself in `IF to_regprocedure(...) IS NOT NULL`. On
-- production that guard passed, because the function was already there. On a
-- fresh database the function does not exist yet, the guard fails, and the
-- whole lockdown silently skips. This migration then creates the function --
-- after the only thing that would have secured it already declined to run.
--
-- Postgres grants EXECUTE to PUBLIC on new functions by default. Without the
-- REVOKEs below, a rebuilt database would hand every logged-in player a
-- SECURITY DEFINER function that rewrites ladder positions. The lockdown has
-- to be repeated here, not assumed.
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
        UPDATE rankings SET position = position - 1
          WHERE position > v_current_pos AND position <= v_new_pos;
        UPDATE rankings SET position = v_new_pos
          WHERE player_id = v_player.id;
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

REVOKE EXECUTE ON FUNCTION public.process_inactive_demotions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_inactive_demotions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_inactive_demotions() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_ranked_players (present in production since the 20260517 lockdown)
-- ---------------------------------------------------------------------------
-- Dead code: nothing in src/ or supabase/functions/ calls this RPC; the app
-- reads the ladder through players_public and rankings directly. It is
-- reproduced anyway so that "the repo rebuilds production" is literally true
-- and the drift check has nothing left to report. It carries the same ordering
-- trap as section 2 -- 20260517035030 locks it down behind an IF EXISTS that
-- fails on a fresh database -- so the REVOKEs are repeated for the same reason.
--
-- Worth deleting from production at some point. That is a separate decision
-- and not one to make inside an alignment migration.
CREATE OR REPLACE FUNCTION public.get_ranked_players()
RETURNS TABLE(
  player_id uuid, full_name text, bio text, preferred_discipline text,
  avatar_url text, is_active boolean, profile_id uuid, ranking_id uuid,
  ranking_position integer, previous_position integer,
  rank1_since timestamp with time zone, fargo_rating integer,
  fargo_robustness integer, wins integer, losses integer,
  current_streak integer, best_streak integer, matches_played integer,
  challenges_issued integer, challenges_received integer,
  defender_wins integer, challenger_wins integer, forfeit_wins integer,
  best_rank_achieved integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    p.id                               AS player_id,
    p.full_name,
    p.bio,
    p.preferred_discipline,
    p.avatar_url,
    p.is_active,
    p.profile_id,
    r.id                               AS ranking_id,
    r.position                         AS ranking_position,
    r.previous_position,
    r.rank1_since,
    m.fargo_rating,
    m.fargo_robustness,
    COALESCE(s.wins, 0)                AS wins,
    COALESCE(s.losses, 0)              AS losses,
    COALESCE(s.current_streak, 0)      AS current_streak,
    COALESCE(s.best_streak, 0)         AS best_streak,
    COALESCE(s.matches_played, 0)      AS matches_played,
    COALESCE(s.challenges_issued, 0)   AS challenges_issued,
    COALESCE(s.challenges_received, 0) AS challenges_received,
    COALESCE(s.defender_wins, 0)       AS defender_wins,
    COALESCE(s.challenger_wins, 0)     AS challenger_wins,
    COALESCE(s.forfeit_wins, 0)        AS forfeit_wins,
    s.best_rank_achieved
  FROM rankings r
  JOIN players p ON p.id = r.player_id
  LEFT JOIN player_reference_metrics m ON m.player_id = p.id
  LEFT JOIN player_season_stats s ON s.player_id = p.id
  WHERE p.is_active = true
  ORDER BY r.position ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_ranked_players() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ranked_players() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Foreign-key indexes (production versions 20260521064123/064142)
-- ---------------------------------------------------------------------------
-- Supabase's performance advisor flags unindexed foreign keys; these were
-- applied straight to production and never written down. Performance only --
-- no behaviour depends on them -- but without them a rebuilt database is
-- measurably slower on exactly the joins the ladder and treasury pages make.

CREATE INDEX IF NOT EXISTS idx_activity_feed_actor_player_id
  ON public.activity_feed USING btree (actor_player_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_profile_id
  ON public.audit_events USING btree (actor_profile_id);

CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_activity_event_id
  ON public.challenge_forfeiture_events USING btree (activity_event_id);
CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_challenger_id
  ON public.challenge_forfeiture_events USING btree (challenger_id);
CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_cooldown_id
  ON public.challenge_forfeiture_events USING btree (cooldown_id);
CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_forfeiting_player_id
  ON public.challenge_forfeiture_events USING btree (forfeiting_player_id);
CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_loser_id
  ON public.challenge_forfeiture_events USING btree (loser_id);
CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_reversed_by_profile_id
  ON public.challenge_forfeiture_events USING btree (reversed_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_winner_id
  ON public.challenge_forfeiture_events USING btree (winner_id);

CREATE INDEX IF NOT EXISTS idx_matches_loser_id
  ON public.matches USING btree (loser_id);
CREATE INDEX IF NOT EXISTS idx_matches_player1_id
  ON public.matches USING btree (player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player1_submitted_winner_id
  ON public.matches USING btree (player1_submitted_winner_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2_id
  ON public.matches USING btree (player2_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2_submitted_winner_id
  ON public.matches USING btree (player2_submitted_winner_id);
CREATE INDEX IF NOT EXISTS idx_matches_winner_id
  ON public.matches USING btree (winner_id);

CREATE INDEX IF NOT EXISTS idx_treasury_ledger_created_by
  ON public.treasury_ledger USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_treasury_ledger_player_id
  ON public.treasury_ledger USING btree (player_id);

-- ---------------------------------------------------------------------------
-- 5. Re-apply two security decisions the repo would otherwise undo
-- ---------------------------------------------------------------------------

-- 5a. treasury_ledger read access.
--
-- 20260321032634_toc_rls_policies.sql creates "Anyone can view treasury" --
-- USING (true) -- which lets any logged-in player read the raw ledger,
-- including per-player rows and the created_by of every entry. Production
-- replaced it with an admin-only policy. Members still see the treasury, but
-- through treasury_summary and treasury_ledger_effects, which are
-- security_invoker=false and therefore read past this policy while exposing
-- only the aggregate (see 20260807170000_treasury_visible_to_members.sql).
--
-- So the transparency the league was promised is delivered by the views, and
-- the table stays closed. Rebuilding from the repo alone would reopen it.
DROP POLICY IF EXISTS "Anyone can view treasury" ON public.treasury_ledger;
DROP POLICY IF EXISTS "Admins can view treasury" ON public.treasury_ledger;
CREATE POLICY "Admins can view treasury" ON public.treasury_ledger
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])
    )
  );

-- 5b. The avatars bucket listing policy.
--
-- 20260323113442_007_player_avatars.sql creates "Avatars are publicly
-- accessible", a SELECT policy on storage.objects covering the whole avatars
-- bucket. Production dropped it (version 20260707034049) because it let anyone
-- enumerate the bucket, not merely fetch a known avatar URL. The bucket is
-- public, so images still load; what is removed is the ability to list.
--
-- Banners keep their equivalent policy -- production still has "Banners are
-- publicly accessible" -- so this drops one policy, not the pair.
--
-- Wrapped: storage.objects is owned by supabase_storage_admin, and a role
-- without that ownership cannot drop policies on it. On a database where the
-- drop is not permitted the policy was almost certainly never created either,
-- so failing the whole migration over it would be the wrong trade.
DO $$
BEGIN
  DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'skipping drop of "Avatars are publicly accessible": not the owner of storage.objects';
END $$;

COMMENT ON COLUMN public.players.activated_at IS
  'Set by track_player_activation_trigger when is_active flips false -> true. Read only by process_inactive_demotions.';
COMMENT ON COLUMN public.players.inactivated_at IS
  'Set by track_player_inactivation_trigger when is_active flips true -> false, and cleared on reactivation. Drives the 30-day inactive demotion.';
