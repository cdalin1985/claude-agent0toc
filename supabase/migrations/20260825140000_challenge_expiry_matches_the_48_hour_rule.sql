-- A database rebuilt from this repo gave members 14 days to answer a challenge.
--
-- The rulebook is unambiguous: "The player being challenged must respond within
-- 48 hours of the callout." Production encodes that as
-- league_settings.challenge_expiry_days = 2, and has since May.
--
-- But nothing in this repo ever set it. The column was created in
-- 20260321032528 with DEFAULT 14 and no later migration touched the value, so
-- production is 2 only because somebody typed 2 into the Admin panel. Replay
-- every migration in this repo into a clean database and you get 14.
--
-- That matters in exactly the situations where it is worst to discover:
-- rebuilding after a loss, standing up a second environment, or the Supabase
-- preview branch that CI creates for every pull request touching migrations.
-- In all three the ladder would run a rule the rulebook does not contain, and
-- the Rules screen -- which renders this value directly -- would state it to
-- members as fact: "A challenge expires if not answered within 14 days."
--
-- Same shape as the challenge-expiry cron and the demotion job before it: not a
-- check that failed, a value nobody had written down. The assert added
-- alongside this (17_settings_match_the_rulebook_assert.sql) is the part that
-- keeps it written down.
--
-- Scoped to rows still holding the original default. An admin who has
-- deliberately set some other number keeps it; this only repairs a database
-- that never had the value set at all. Against production, where the value is
-- already 2, this is a no-op.

ALTER TABLE public.league_settings
  ALTER COLUMN challenge_expiry_days SET DEFAULT 2;

UPDATE public.league_settings
   SET challenge_expiry_days = 2
 WHERE challenge_expiry_days = 14;

COMMENT ON COLUMN public.league_settings.challenge_expiry_days IS
  'Days a pending challenge stays answerable. The rulebook''s 48-hour response '
  'window, in days. This is the column that runs the league: create-challenge '
  'sets expires_at from it and expire_stale_challenges sweeps against it.';

-- challenge_response_hours is NOT the column that does this, despite its name
-- and its 48. It was added in 20260807120000 and has never been read by
-- anything -- not an edge function, not a trigger, not the client. It stays in
-- the table because dropping a column is not a thing to do in passing, but it
-- is removed from the Admin panel in this change: a control that saves and
-- changes nothing is worse than no control.
COMMENT ON COLUMN public.league_settings.challenge_response_hours IS
  'UNUSED. Nothing reads this column. The 48-hour response window is enforced '
  'through challenge_expiry_days (= 2). Kept only so an existing row is not '
  'disturbed; do not wire new behaviour to it without removing the other.';
