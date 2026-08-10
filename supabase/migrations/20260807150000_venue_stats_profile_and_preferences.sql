-- Three gaps between what the league was promised and what existed:
-- per-venue stats, real profile customization, and feature toggles that
-- actually take effect.
--
-- The toggles are the part with a design decision worth defending. Checking
-- preferences at each send site guarantees that in a year someone adds a
-- notification and forgets. So enforcement lives in ONE place -- a BEFORE
-- INSERT trigger on notifications -- and every path, present and future, is
-- gated automatically whether its author remembers or not. Push asks the same
-- SQL function, so there is a single source of truth for "does this player want
-- this?".

-- ---------------------------------------------------------------------------
-- (a) Stats by venue
-- ---------------------------------------------------------------------------
--
-- Required: "Players should be able to view their own stats itemized by venue
-- and discipline, and every other league member's stats as well." Per-discipline
-- stats were thorough; per-venue did not exist at all. Deliberately mirrors
-- player_discipline_stats column for column so the two read and aggregate the
-- same way -- one shape to learn, not two.
--
-- venue is TEXT with no CHECK: venues come from league_settings.venues, which an
-- admin can change. A constraint here would turn adding a venue into a
-- migration.

CREATE TABLE IF NOT EXISTS public.player_venue_stats (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id           UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  venue               TEXT NOT NULL,
  matches_played      INTEGER NOT NULL DEFAULT 0,
  wins                INTEGER NOT NULL DEFAULT 0,
  losses              INTEGER NOT NULL DEFAULT 0,
  current_streak      INTEGER NOT NULL DEFAULT 0,
  best_streak         INTEGER NOT NULL DEFAULT 0,
  challenger_wins     INTEGER NOT NULL DEFAULT 0,
  defender_wins       INTEGER NOT NULL DEFAULT 0,
  total_race_length   INTEGER NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_venue_stats_unique
  ON public.player_venue_stats(player_id, venue);
CREATE INDEX IF NOT EXISTS idx_player_venue_stats_player
  ON public.player_venue_stats(player_id);

ALTER TABLE public.player_venue_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view venue stats" ON public.player_venue_stats;
CREATE POLICY "Anyone can view venue stats"
  ON public.player_venue_stats FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.player_venue_stats FROM anon, authenticated;
GRANT SELECT ON public.player_venue_stats TO anon, authenticated;
GRANT ALL ON public.player_venue_stats TO service_role;

-- Backfill from every confirmed match so the feature is not empty on day one.
-- Ordered by completion so streaks are computed in the sequence they happened,
-- not in arbitrary row order.
WITH participants AS (
  SELECT
    m.venue,
    m.race_length,
    m.completed_at,
    p.player_id,
    (p.player_id = m.winner_id)                    AS won,
    (p.player_id = m.player1_id)                   AS was_challenger
  FROM public.matches m
  CROSS JOIN LATERAL (VALUES (m.player1_id), (m.player2_id)) AS p(player_id)
  WHERE m.status IN ('confirmed', 'resolved')
    AND m.winner_id IS NOT NULL
    AND m.venue IS NOT NULL
),
ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY player_id, venue ORDER BY completed_at NULLS LAST) AS seq
  FROM participants
),
-- A streak is the length of the current run of wins ending at the last match.
runs AS (
  SELECT player_id, venue, won, seq,
         seq - ROW_NUMBER() OVER (PARTITION BY player_id, venue, won ORDER BY seq) AS grp
  FROM ordered
),
run_lengths AS (
  SELECT player_id, venue, won, COUNT(*) AS run_len, MAX(seq) AS ends_at
  FROM runs GROUP BY player_id, venue, won, grp
),
aggregated AS (
  SELECT
    o.player_id,
    o.venue,
    COUNT(*)                                        AS matches_played,
    COUNT(*) FILTER (WHERE o.won)                   AS wins,
    COUNT(*) FILTER (WHERE NOT o.won)               AS losses,
    COUNT(*) FILTER (WHERE o.won AND o.was_challenger)     AS challenger_wins,
    COUNT(*) FILTER (WHERE o.won AND NOT o.was_challenger) AS defender_wins,
    COALESCE(SUM(o.race_length), 0)                 AS total_race_length,
    MAX(o.seq)                                      AS last_seq
  FROM ordered o
  GROUP BY o.player_id, o.venue
)
INSERT INTO public.player_venue_stats (
  player_id, venue, matches_played, wins, losses,
  current_streak, best_streak, challenger_wins, defender_wins, total_race_length
)
SELECT
  a.player_id,
  a.venue,
  a.matches_played,
  a.wins,
  a.losses,
  COALESCE((SELECT r.run_len FROM run_lengths r
             WHERE r.player_id = a.player_id AND r.venue = a.venue
               AND r.won AND r.ends_at = a.last_seq), 0),
  COALESCE((SELECT MAX(r.run_len) FROM run_lengths r
             WHERE r.player_id = a.player_id AND r.venue = a.venue AND r.won), 0),
  a.challenger_wins,
  a.defender_wins,
  a.total_race_length
FROM aggregated a
ON CONFLICT (player_id, venue) DO NOTHING;

COMMENT ON TABLE public.player_venue_stats IS
  'Per-player, per-venue record. Mirrors player_discipline_stats column for column. venue is unconstrained TEXT on purpose: venues live in league_settings.venues and an admin may change them without a migration.';

-- ---------------------------------------------------------------------------
-- (b) Profile customization
-- ---------------------------------------------------------------------------
--
-- Required: players can "customize their profile in cool ways" and the app
-- should be "super fun and interactive". Everything here is public to logged-in
-- members, which is what makes it worth filling in.

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS nickname      TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS tagline       TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS home_venue    TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS years_playing INTEGER;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS cue_brand     TEXT;

-- Bounded so one player cannot wreck every roster row they appear in.
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_profile_text_bounds;
ALTER TABLE public.players ADD CONSTRAINT players_profile_text_bounds CHECK (
  (nickname  IS NULL OR char_length(nickname)  <= 24) AND
  (tagline   IS NULL OR char_length(tagline)   <= 80) AND
  (cue_brand IS NULL OR char_length(cue_brand) <= 40) AND
  (bio       IS NULL OR char_length(bio)       <= 500)
);

-- accent_color is created and constrained to the TOC preset palette by
-- 20260807010000_profile_banner_accent.sql. A second CHECK here would be
-- redundant at best, and would fight it at worst.

ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_years_playing_range;
ALTER TABLE public.players ADD CONSTRAINT players_years_playing_range CHECK (
  years_playing IS NULL OR (years_playing >= 0 AND years_playing <= 90)
);

-- players UPDATE for `authenticated` is a column-level allowlist, so new columns
-- are NOT writable until named here. That default-deny is deliberate; grant only
-- the cosmetic ones and never role, is_active or profile_id.
GRANT UPDATE (nickname, tagline, accent_color, banner_url, home_venue, years_playing, cue_brand)
  ON public.players TO authenticated;

-- ---------------------------------------------------------------------------
-- (c) Feature toggles, enforced in one place
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.player_preferences (
  player_id             UUID PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  notify_challenges     BOOLEAN NOT NULL DEFAULT TRUE,
  notify_reminders      BOOLEAN NOT NULL DEFAULT TRUE,
  notify_results        BOOLEAN NOT NULL DEFAULT TRUE,
  notify_activity       BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  show_stats_publicly   BOOLEAN NOT NULL DEFAULT TRUE,
  show_profile_details  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.player_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view player preferences" ON public.player_preferences;
-- Readable by members because the display toggles change how OTHER players
-- render this player's card; hiding the toggle would make the UI guess.
CREATE POLICY "Anyone can view player preferences"
  ON public.player_preferences FOR SELECT USING (true);

DROP POLICY IF EXISTS "Players can update own preferences" ON public.player_preferences;
CREATE POLICY "Players can update own preferences"
  ON public.player_preferences FOR UPDATE
  USING (player_id IN (SELECT id FROM public.players WHERE profile_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT id FROM public.players WHERE profile_id = auth.uid()));

GRANT SELECT ON public.player_preferences TO anon, authenticated;
GRANT UPDATE (notify_challenges, notify_reminders, notify_results, notify_activity,
              push_enabled, show_stats_publicly, show_profile_details, updated_at)
  ON public.player_preferences TO authenticated;
-- No INSERT or DELETE for players: rows are created by trigger, one per player,
-- so a player can never orphan or duplicate their own settings.
REVOKE INSERT, DELETE ON public.player_preferences FROM anon, authenticated;
GRANT ALL ON public.player_preferences TO service_role;

INSERT INTO public.player_preferences (player_id)
SELECT id FROM public.players
ON CONFLICT (player_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_player_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.player_preferences (player_id)
  VALUES (NEW.id)
  ON CONFLICT (player_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_player_preferences ON public.players;
CREATE TRIGGER trg_ensure_player_preferences
  AFTER INSERT ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.ensure_player_preferences();

-- Which toggle governs a notification type. NULL means the notification is
-- mandatory and cannot be switched off: anything carrying a money, ranking or
-- admin consequence a player must not be able to miss.
CREATE OR REPLACE FUNCTION public.notification_category(p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_type IN ('challenge_received', 'challenge_issued', 'challenge_accepted',
                    'challenge_expired', 'challenge_cancelled', 'challenge_declined')
      THEN 'challenges'
    -- match_reminder_24h and match_reminder_1h are what the live reminder
    -- system actually sends (20260807000000_match_reminders.sql). Without them
    -- here they would map to NULL, be treated as mandatory, and the Match
    -- Reminders toggle would do nothing.
    WHEN p_type IN ('match_reminder', 'match_reminder_24h', 'match_reminder_1h', 'match_scheduled')
      THEN 'reminders'
    WHEN p_type IN ('result_submitted', 'result_confirmed', 'match_confirmed',
                    'match_started', 'match_fee_recorded')
      THEN 'results'
    WHEN p_type IN ('rank_change', 'player_invited')
      THEN 'activity'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.notification_category(TEXT) IS
  'Maps a notification type to the preference that governs it, or NULL when it is mandatory. Forfeits, disputes, rank-1 penalties, treasury and admin actions all return NULL by design: they carry consequences a player must not be able to switch off.';

CREATE OR REPLACE FUNCTION public.player_accepts_notification(p_player_id UUID, p_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category TEXT := public.notification_category(p_type);
  v_prefs    public.player_preferences%ROWTYPE;
BEGIN
  IF v_category IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO v_prefs FROM public.player_preferences WHERE player_id = p_player_id;
  -- No preferences row yet: default to delivering. Silence must never be the
  -- consequence of missing configuration.
  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;

  RETURN CASE v_category
    WHEN 'challenges' THEN v_prefs.notify_challenges
    WHEN 'reminders'  THEN v_prefs.notify_reminders
    WHEN 'results'    THEN v_prefs.notify_results
    WHEN 'activity'   THEN v_prefs.notify_activity
    ELSE TRUE
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.player_accepts_notification(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_accepts_notification(UUID, TEXT) FROM anon;
-- Readable by the client so the UI can explain why something is muted, and by
-- the edge functions before sending push.
GRANT EXECUTE ON FUNCTION public.player_accepts_notification(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.player_accepts_notification(UUID, TEXT) IS
  'Single source of truth for whether a player wants a given notification. Used by the notifications insert trigger AND by sendPush, so in-app and push can never disagree. Returns TRUE for mandatory types and when no preferences row exists.';

-- The enforcement point. Every insert into notifications passes through here, so
-- a toggle takes effect for code that does not know the toggle exists.
CREATE OR REPLACE FUNCTION public.apply_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.player_accepts_notification(NEW.player_id, NEW.type) THEN
    RETURN NEW;
  END IF;
  -- Returning NULL in a BEFORE INSERT drops the row silently, which is exactly
  -- what "I turned this off" should mean.
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_notification_preferences ON public.notifications;
CREATE TRIGGER trg_apply_notification_preferences
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.apply_notification_preferences();

COMMENT ON FUNCTION public.apply_notification_preferences() IS
  'BEFORE INSERT gate on notifications. Enforcing preferences here rather than at each send site means a notification added years from now is governed automatically, whether or not its author remembers preferences exist.';
