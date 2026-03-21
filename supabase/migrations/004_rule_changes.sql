-- ============================================================
-- TOC App — Migration 004: Rule Changes
-- ============================================================

-- 1. Update race_length constraints: min 6, no maximum
ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_race_length_check;
ALTER TABLE challenges ADD CONSTRAINT challenges_race_length_check CHECK (race_length >= 6);

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_race_length_check;
ALTER TABLE matches ADD CONSTRAINT matches_race_length_check CHECK (race_length >= 6);

-- 2. Add match_deadline to challenges (set when challenge is accepted)
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS match_deadline TIMESTAMPTZ;

-- 3. Add per-player payment method tracking to matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS player1_payment_method TEXT
  CHECK (player1_payment_method IN ('envelope', 'digital'));
ALTER TABLE matches ADD COLUMN IF NOT EXISTS player2_payment_method TEXT
  CHECK (player2_payment_method IN ('envelope', 'digital'));

-- 4. Track when a player first reached #1 (for 30-day obligation window)
ALTER TABLE rankings ADD COLUMN IF NOT EXISTS rank1_since TIMESTAMPTZ;

-- 5. Update player_season_stats: remove points, add richer stats
ALTER TABLE player_season_stats DROP COLUMN IF EXISTS points;
ALTER TABLE player_season_stats ADD COLUMN IF NOT EXISTS challenges_issued INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_season_stats ADD COLUMN IF NOT EXISTS challenges_received INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_season_stats ADD COLUMN IF NOT EXISTS defender_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_season_stats ADD COLUMN IF NOT EXISTS challenger_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_season_stats ADD COLUMN IF NOT EXISTS forfeit_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_season_stats ADD COLUMN IF NOT EXISTS best_rank_achieved INTEGER;

-- 6. Create per-discipline stats table
CREATE TABLE IF NOT EXISTS player_discipline_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL CHECK (discipline IN ('8 Ball', '9 Ball', '10 Ball')),
  matches_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  challenger_wins INTEGER NOT NULL DEFAULT 0,
  defender_wins INTEGER NOT NULL DEFAULT 0,
  challenges_issued INTEGER NOT NULL DEFAULT 0,
  challenges_received INTEGER NOT NULL DEFAULT 0,
  forfeit_wins INTEGER NOT NULL DEFAULT 0,
  total_race_length INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, discipline)
);

-- 7. RLS + grants for player_discipline_stats
ALTER TABLE player_discipline_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view discipline stats" ON player_discipline_stats FOR SELECT USING (true);
GRANT SELECT ON player_discipline_stats TO anon;
GRANT SELECT, INSERT, UPDATE ON player_discipline_stats TO authenticated;
GRANT ALL ON player_discipline_stats TO service_role;

-- 8. Seed one row per player per discipline
INSERT INTO player_discipline_stats (player_id, discipline)
SELECT p.id, d.discipline
FROM players p
CROSS JOIN (VALUES ('8 Ball'), ('9 Ball'), ('10 Ball')) AS d(discipline)
ON CONFLICT (player_id, discipline) DO NOTHING;

-- 9. New league_settings columns
ALTER TABLE league_settings ADD COLUMN IF NOT EXISTS challenge_response_hours INTEGER NOT NULL DEFAULT 48;
ALTER TABLE league_settings ADD COLUMN IF NOT EXISTS match_play_days INTEGER NOT NULL DEFAULT 10;
ALTER TABLE league_settings ADD COLUMN IF NOT EXISTS challenge_weekly_limit INTEGER NOT NULL DEFAULT 2;
ALTER TABLE league_settings ADD COLUMN IF NOT EXISTS first_challenge_range INTEGER NOT NULL DEFAULT 10;

-- 10. Update existing settings values
UPDATE league_settings SET min_race = 6;

-- 11. Add realtime for new table
ALTER PUBLICATION supabase_realtime ADD TABLE player_discipline_stats;
