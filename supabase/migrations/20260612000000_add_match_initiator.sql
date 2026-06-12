-- Single-scoreboard support: track which player initiated the match and keeps score.
-- The challenger (player1) is recorded as the initiator when a challenge is accepted.
-- Nullable + backward-compatible: existing matches keep allowing either participant
-- to update the live score until an initiator is set.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS initiated_by_player_id UUID REFERENCES players(id);

CREATE INDEX IF NOT EXISTS matches_initiated_by_idx ON matches(initiated_by_player_id);
