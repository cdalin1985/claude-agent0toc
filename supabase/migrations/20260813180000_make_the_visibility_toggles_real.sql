-- Two toggles in Settings under "What Others See" were decoration.
--
-- Both were enforced by deciding what to *render*: PlayerPage.tsx:117-118 read
-- the target player's preferences and then chose which blocks to draw. The data
-- was fetched either way, so anyone who opened devtools -- or who called the
-- REST API with the publishable key every member's browser already holds -- saw
-- exactly what the toggle claimed to hide.
--
-- Nothing behind them is dangerous to leak: win/loss breakdowns, a nickname, a
-- cue brand. The problem is narrower and worse than danger. The screen makes a
-- promise about other people's access, and the app could not keep it. In a
-- league where members pay $5 a match and the ladder is the record, a settings
-- screen that lies about visibility is the wrong thing to launch with.
--
-- The labels were already honest about scope ("Your name, rank and match
-- history stay on the ladder either way -- that's the league record"), so the
-- fix is to make the behaviour match the labels rather than reword them.

-- ---------------------------------------------------------------------------
-- 1. home_venue: the one profile column with no bound
-- ---------------------------------------------------------------------------
--
-- 20260807150000 bounded nickname, tagline, cue_brand and bio "so one player
-- cannot wreck every roster row they appear in", and left home_venue out. The
-- UI is a <select> of admin-configured venues, so nothing reachable by tapping
-- can exceed this -- but authenticated holds column-level UPDATE on home_venue,
-- and a direct PATCH is not obliged to use the dropdown.
--
-- 60 is well clear of any real venue name. Verified before adding: no row in
-- production has home_venue set at all, so this constrains nothing existing.

ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_profile_text_bounds;
ALTER TABLE public.players ADD CONSTRAINT players_profile_text_bounds CHECK (
  (nickname   IS NULL OR char_length(nickname)   <= 24) AND
  (tagline    IS NULL OR char_length(tagline)    <= 80) AND
  (cue_brand  IS NULL OR char_length(cue_brand)  <= 40) AND
  (bio        IS NULL OR char_length(bio)        <= 500) AND
  (home_venue IS NULL OR char_length(home_venue) <= 60)
);

-- ---------------------------------------------------------------------------
-- 2. "Detailed Stats" -> RLS on the two tables it names
-- ---------------------------------------------------------------------------
--
-- The toggle's own description is "Your by-discipline and by-venue breakdowns",
-- which is exactly player_discipline_stats and player_venue_stats. Both were
-- SELECT USING (true). Both are read only by PlayerPage, so moving the decision
-- into RLS changes nothing else in the app.
--
-- Deliberately NOT applied to player_season_stats: that feeds the ladder, and
-- the ladder record is public by the league's own rules. Hiding it would break
-- the standings for everyone rather than protect anybody.
--
-- COALESCE(..., TRUE) because a player with no preferences row has hidden
-- nothing. Defaulting to hidden would blank profiles for anyone the
-- backfill missed.

DROP POLICY IF EXISTS "Anyone can view discipline stats" ON public.player_discipline_stats;
DROP POLICY IF EXISTS "Discipline stats follow the player's visibility choice" ON public.player_discipline_stats;
CREATE POLICY "Discipline stats follow the player's visibility choice"
  ON public.player_discipline_stats FOR SELECT
  USING (
    COALESCE(
      (SELECT pp.show_stats_publicly
         FROM public.player_preferences pp
        WHERE pp.player_id = player_discipline_stats.player_id),
      TRUE)
    -- You can always see your own, or the toggle would hide them from you too
    -- and there would be no way to check what you had turned off.
    OR EXISTS (
      SELECT 1 FROM public.players p
       WHERE p.id = player_discipline_stats.player_id
         AND p.profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "Anyone can view venue stats" ON public.player_venue_stats;
DROP POLICY IF EXISTS "Venue stats follow the player's visibility choice" ON public.player_venue_stats;
CREATE POLICY "Venue stats follow the player's visibility choice"
  ON public.player_venue_stats FOR SELECT
  USING (
    COALESCE(
      (SELECT pp.show_stats_publicly
         FROM public.player_preferences pp
        WHERE pp.player_id = player_venue_stats.player_id),
      TRUE)
    OR EXISTS (
      SELECT 1 FROM public.players p
       WHERE p.id = player_venue_stats.player_id
         AND p.profile_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. "Profile Details" -> a view that redacts the columns it names
-- ---------------------------------------------------------------------------
--
-- These columns live on players, which the ladder reads in full for every
-- active member every 30 seconds. RLS cannot help: it decides which ROWS you
-- see, and hiding a player's row would remove them from the standings.
--
-- A view can, because it decides what each COLUMN evaluates to. Every column of
-- players is present with its own name and type, so the client keeps
-- select('*') and every existing type stays correct -- the only change on the
-- app side is one table name in useRankings. That matters: narrowing the ladder
-- query to a column list would have been the other option, and would have
-- broken any page reading a field I failed to list, silently, because
-- RankedPlayer.player is typed as the full row either way.
--
-- security_invoker so RLS on players still applies to the caller. Without it
-- the view would run as its owner and quietly become a way around row policies.

DROP VIEW IF EXISTS public.players_public;
CREATE VIEW public.players_public
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.profile_id,
  p.full_name,
  p.is_active,
  p.created_at,
  p.updated_at,
  CASE WHEN vis.visible THEN p.bio           END AS bio,
  p.preferred_discipline,
  p.avatar_url,
  -- Exactly the columns the migration set creates and src/types/database.ts
  -- declares, which is not the same as the columns production has: it also
  -- carries activated_at and inactivated_at, which NO migration creates and
  -- nothing in src/ or supabase/functions/ reads. They were added by hand at
  -- some point and the repo never learned about them. Listing them here would
  -- make this file fail to build from the migration set alone -- which is how
  -- the rehearsal caught them. Left out rather than adopted; whether to drop
  -- them from production is a separate decision and not one to make silently.
  CASE WHEN vis.visible THEN p.banner_url    END AS banner_url,
  CASE WHEN vis.visible THEN p.accent_color  END AS accent_color,
  CASE WHEN vis.visible THEN p.nickname      END AS nickname,
  CASE WHEN vis.visible THEN p.tagline       END AS tagline,
  CASE WHEN vis.visible THEN p.home_venue    END AS home_venue,
  CASE WHEN vis.visible THEN p.years_playing END AS years_playing,
  CASE WHEN vis.visible THEN p.cue_brand     END AS cue_brand
FROM public.players p
CROSS JOIN LATERAL (
  SELECT
    COALESCE(
      (SELECT pp.show_profile_details
         FROM public.player_preferences pp
        WHERE pp.player_id = p.id),
      TRUE)
    OR COALESCE(p.profile_id = auth.uid(), FALSE)
    AS visible
) vis;

-- Supabase's default privileges GRANT ALL on new objects in public to anon and
-- authenticated -- the exact behaviour that made the column-level allowlist on
-- players decorative until 20260812050000. A new view inherits it, so revoke
-- first and grant back only SELECT. Without this the view arrives writable.
REVOKE ALL ON public.players_public FROM PUBLIC;
REVOKE ALL ON public.players_public FROM anon, authenticated;
GRANT SELECT ON public.players_public TO anon, authenticated;
GRANT ALL    ON public.players_public TO service_role;

COMMENT ON VIEW public.players_public IS
  'players with the profile-detail columns nulled for members who turned "Profile Details" off, and never for the owner. The ladder reads this instead of players so the toggle is enforced where the data is served rather than where it is drawn.';
