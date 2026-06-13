-- Pre-history baseline: columns and tables that existed in production before
-- the migration chain was established, and are referenced by subsequent migrations.
-- All statements use IF NOT EXISTS / IF EXISTS guards to be idempotent.

-- matches: payment method columns referenced by 013_release_readiness bare UPDATEs
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS player1_payment_method text,
  ADD COLUMN IF NOT EXISTS player2_payment_method text;

-- rankings: rank1_since referenced by workflow_connection_fixes and serialize_ranking_mutations
ALTER TABLE public.rankings
  ADD COLUMN IF NOT EXISTS rank1_since timestamptz;

-- player_season_stats: extra stat columns referenced by function bodies in 013_release_readiness+
ALTER TABLE public.player_season_stats
  ADD COLUMN IF NOT EXISTS challenges_issued integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS challenges_received integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS defender_wins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS challenger_wins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forfeit_wins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_rank_achieved integer,
  ADD COLUMN IF NOT EXISTS forfeits integer NOT NULL DEFAULT 0;

-- player_discipline_stats: table entirely missing from toc_schema.sql
-- 013_release_readiness does ALTER TABLE player_discipline_stats ADD COLUMN which
-- fails with "relation does not exist" if the table isn't here first.
CREATE TABLE IF NOT EXISTS public.player_discipline_stats (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  discipline text NOT NULL,
  matches_played integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  challenger_wins integer NOT NULL DEFAULT 0,
  defender_wins integer NOT NULL DEFAULT 0,
  challenges_issued integer NOT NULL DEFAULT 0,
  challenges_received integer NOT NULL DEFAULT 0,
  forfeit_wins integer NOT NULL DEFAULT 0,
  total_race_length integer NOT NULL DEFAULT 0,
  forfeits integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, discipline)
);
