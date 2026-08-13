-- Runtime assertions for 20260813180000_make_the_visibility_toggles_real.sql.
--
-- BEHAVIOURAL on purpose. The bug being fixed was a privacy control that looked
-- enforced because a component did not draw something; asserting that a policy
-- or a view merely EXISTS would repeat that mistake at a different layer. Each
-- check here reads data the way a member's browser reads it and requires the
-- hidden thing to be absent and the visible thing to be present.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'VISIBILITY: ALL CHECKS PASSED' on success.

-- ---------------------------------------------------------------------------
-- Seed, as owner. Two players: one hides everything, one hides nothing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  u_hider uuid := '00000000-0000-4000-8000-0000000000a1';
  u_other uuid := '00000000-0000-4000-8000-0000000000a2';
  p_hider uuid;
  p_open  uuid;
  bounded boolean;
  failures text[] := '{}';
BEGIN
  -- players.profile_id references profiles(id), which references auth.users(id),
  -- so a claimed player needs both rows. auth.uid() is matched against
  -- profile_id, and that chain is what makes the owner exception testable.
  INSERT INTO auth.users (id, email) VALUES
    (u_hider, 'hider@example.test'), (u_other, 'other@example.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, email, display_name) VALUES
    (u_hider, 'hider@example.test', 'Visibility Hider'),
    (u_other, 'other@example.test', 'Visibility Other')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO players (full_name, profile_id, nickname, tagline, bio, home_venue, years_playing, cue_brand, accent_color, banner_url)
  VALUES ('Visibility Hider', u_hider, 'Hush', 'Says nothing', 'A bio', 'Eagles', 12, 'Predator', '#D4AF37', 'https://example.test/b.png')
  RETURNING id INTO p_hider;

  INSERT INTO players (full_name, nickname, tagline, bio, home_venue, years_playing, cue_brand)
  VALUES ('Visibility Open', 'Loud', 'Says plenty', 'Another bio', 'Valley Hub', 8, 'McDermott')
  RETURNING id INTO p_open;

  INSERT INTO player_preferences (player_id, show_stats_publicly, show_profile_details)
  VALUES (p_hider, FALSE, FALSE), (p_open, TRUE, TRUE)
  ON CONFLICT (player_id) DO UPDATE
    SET show_stats_publicly  = EXCLUDED.show_stats_publicly,
        show_profile_details = EXCLUDED.show_profile_details;

  INSERT INTO player_discipline_stats (player_id, discipline, wins, losses)
  VALUES (p_hider, '8ball', 3, 1), (p_open, '8ball', 2, 2);

  INSERT INTO player_venue_stats (player_id, venue, wins, losses)
  VALUES (p_hider, 'Eagles', 3, 1), (p_open, 'Eagles', 2, 2);

  -- ------------------------------------------------ home_venue is bounded ---
  -- The UI is a dropdown, so this is only reachable by a direct PATCH. That is
  -- precisely why it belongs in the database and not in the component.
  BEGIN
    bounded := false;
    UPDATE players SET home_venue = repeat('x', 61) WHERE id = p_open;
  EXCEPTION WHEN check_violation THEN
    bounded := true;
  END;
  IF NOT bounded THEN
    failures := array_append(failures, 'home_venue accepted 61 characters; the bound is missing');
  END IF;

  -- A real venue name must still save, or the bound has broken the feature it
  -- was meant to protect.
  BEGIN
    UPDATE players SET home_venue = 'Silver Dollar Saloon' WHERE id = p_open;
  EXCEPTION WHEN check_violation THEN
    failures := array_append(failures, 'a normal venue name was rejected by players_profile_text_bounds');
  END;

  -- ------------------------------------------------- the view is not a table ---
  -- Default privileges GRANT ALL on new objects in public. If the REVOKE were
  -- dropped, the view would arrive writable.
  IF has_table_privilege('authenticated', 'public.players_public', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.players_public', 'INSERT')
     OR has_table_privilege('authenticated', 'public.players_public', 'DELETE') THEN
    failures := array_append(failures, 'authenticated can write through players_public');
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.players_public', 'SELECT') THEN
    failures := array_append(failures, 'authenticated cannot read players_public -- the ladder is broken');
  END IF;

  IF array_length(failures, 1) > 0 THEN
    RAISE EXCEPTION 'VISIBILITY FAILURES: %', array_to_string(failures, ' | ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Read as a member. SET ROLE (not SET LOCAL -- these statements are not in one
-- transaction) so row policies actually apply; as owner they would be bypassed
-- and every check below would pass without testing anything.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a2"}', false);
SET ROLE authenticated;

DO $$
DECLARE
  p_hider uuid;
  p_open  uuid;
  r       record;
  failures text[] := '{}';
BEGIN
  SELECT id INTO p_hider FROM players WHERE full_name = 'Visibility Hider';
  SELECT id INTO p_open  FROM players WHERE full_name = 'Visibility Open';

  -- ------------------------------------------- detailed stats are withheld ---
  IF EXISTS (SELECT 1 FROM player_discipline_stats WHERE player_id = p_hider) THEN
    failures := array_append(failures, 'another member can read discipline stats of a player who turned them off');
  END IF;
  IF EXISTS (SELECT 1 FROM player_venue_stats WHERE player_id = p_hider) THEN
    failures := array_append(failures, 'another member can read venue stats of a player who turned them off');
  END IF;

  -- ...and a player who left them on is unaffected. Without this the policy
  -- could "pass" by hiding everyone's stats from everyone.
  IF NOT EXISTS (SELECT 1 FROM player_discipline_stats WHERE player_id = p_open) THEN
    failures := array_append(failures, 'discipline stats are hidden even with the toggle on');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM player_venue_stats WHERE player_id = p_open) THEN
    failures := array_append(failures, 'venue stats are hidden even with the toggle on');
  END IF;

  -- ---------------------------------------- profile details are redacted ---
  SELECT * INTO r FROM players_public WHERE id = p_hider;
  IF r.nickname IS NOT NULL OR r.tagline IS NOT NULL OR r.bio IS NOT NULL
     OR r.home_venue IS NOT NULL OR r.years_playing IS NOT NULL
     OR r.cue_brand IS NOT NULL OR r.banner_url IS NOT NULL
     OR r.accent_color IS NOT NULL THEN
    failures := array_append(failures, 'players_public served a detail column for a player who turned details off');
  END IF;
  -- The ladder still needs this row to exist and be identifiable, or hiding
  -- details would remove someone from the standings.
  IF r.id IS NULL OR r.full_name IS DISTINCT FROM 'Visibility Hider' THEN
    failures := array_append(failures, 'players_public dropped identity for a player who turned details off');
  END IF;

  SELECT * INTO r FROM players_public WHERE id = p_open;
  IF r.nickname IS NULL OR r.tagline IS NULL OR r.bio IS NULL
     OR r.home_venue IS NULL OR r.years_playing IS NULL OR r.cue_brand IS NULL THEN
    failures := array_append(failures, 'players_public redacted a player who left details on');
  END IF;

  IF array_length(failures, 1) > 0 THEN
    RAISE EXCEPTION 'VISIBILITY FAILURES (as another member): %', array_to_string(failures, ' | ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Read as the hider. Turning a toggle off must not hide your own data from
-- you -- there would be no way to see what you had switched off.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a1"}', false);

DO $$
DECLARE
  p_hider uuid;
  r       record;
  failures text[] := '{}';
BEGIN
  SELECT id INTO p_hider FROM players WHERE full_name = 'Visibility Hider';

  IF NOT EXISTS (SELECT 1 FROM player_discipline_stats WHERE player_id = p_hider) THEN
    failures := array_append(failures, 'a player cannot see their own discipline stats after hiding them');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM player_venue_stats WHERE player_id = p_hider) THEN
    failures := array_append(failures, 'a player cannot see their own venue stats after hiding them');
  END IF;

  SELECT * INTO r FROM players_public WHERE id = p_hider;
  IF r.nickname IS NULL OR r.bio IS NULL OR r.home_venue IS NULL THEN
    failures := array_append(failures, 'a player cannot see their own profile details after hiding them');
  END IF;

  IF array_length(failures, 1) > 0 THEN
    RAISE EXCEPTION 'VISIBILITY FAILURES (as the owner): %', array_to_string(failures, ' | ');
  END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, false);

DO $$ BEGIN RAISE NOTICE 'VISIBILITY: ALL CHECKS PASSED'; END $$;
