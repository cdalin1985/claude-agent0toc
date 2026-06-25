-- Performance: matches is queried by player1_id/player2_id (MatchesPage,
-- rank1 compliance check) but only had an index on status. Add per-player
-- indexes so these lookups don't fall back to a full table scan as the
-- table grows.
CREATE INDEX IF NOT EXISTS idx_matches_player1 ON matches(player1_id, status);
CREATE INDEX IF NOT EXISTS idx_matches_player2 ON matches(player2_id, status);

-- Performance: create-challenge's weekly-limit check filters by
-- challenger_id and created_at, which idx_challenges_challenger
-- (challenger_id, status) doesn't cover.
CREATE INDEX IF NOT EXISTS idx_challenges_challenger_created ON challenges(challenger_id, created_at DESC);
