-- The numbers the rulebook specifies, checked against the database a rebuild
-- of this repo actually produces.
--
-- Every rule in league_settings is enforced server-side and rendered to members
-- verbatim by the Rules screen. That makes the row honest about the database
-- and says nothing about whether the database is honest about the rulebook --
-- and until this file, nothing checked the second half. 01_rules_assert sets
-- these values itself before testing behaviour, so it passes whatever they are.
--
-- It was not hypothetical. challenge_expiry_days was created with DEFAULT 14
-- and never set by any migration; production reads 2 only because somebody
-- typed it into the Admin panel in May. A database rebuilt from this repo gave
-- members a fortnight to answer a challenge, and the Rules screen would have
-- told them so in as many words.
--
-- README.md is the single source of truth. These are its numbers. If the league
-- changes a rule, this file is one of the places that has to change with it --
-- which is the point: it makes a silent divergence impossible.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'RULEBOOK SETTINGS: ALL CHECKS PASSED' on success.

DO $$
DECLARE
  s        league_settings%ROWTYPE;
  failures text[] := '{}';

  -- [column, expected, the rulebook line it comes from]
  checks   text[][] := ARRAY[
    ['min_race',                 '6',  'Minimum race to six'],
    ['challenge_range',          '5',  'After your first challenge - up to 5 spots above'],
    ['first_challenge_range',    '10', 'Your first challenge - up to 10 spots above'],
    ['challenge_weekly_limit',   '2',  'Two challenges per week'],
    ['challenge_expiry_days',    '2',  'must respond within 48 hours of the callout'],
    ['match_play_days',          '10', 'played within 10 days of the challenge being accepted'],
    ['cooldown_hours',           '24', 'you must wait 24 hours to challenge up']
  ];
  actual   integer;
BEGIN
  SELECT * INTO s FROM league_settings LIMIT 1;

  IF s.id IS NULL THEN
    RAISE EXCEPTION 'RULEBOOK SETTINGS: league_settings has no row at all -- every rule falls back to a client default';
  END IF;

  FOR i IN 1 .. array_length(checks, 1) LOOP
    EXECUTE format('SELECT ($1).%I', checks[i][1]) INTO actual USING s;
    IF actual IS DISTINCT FROM checks[i][2]::integer THEN
      failures := array_append(failures, format(
        '%s is %s, rulebook says %s (%s)',
        checks[i][1], COALESCE(actual::text, 'NULL'), checks[i][2], checks[i][3]));
    END IF;
  END LOOP;

  -- "No maximum, if it is agreed upon." NULL, not a large number: a cap of 99
  -- would read as no maximum right up until two players agreed a race to 101.
  IF s.max_race IS NOT NULL THEN
    failures := array_append(failures, format(
      'max_race is %s, rulebook says there is no maximum (expected NULL)', s.max_race));
  END IF;

  -- "Matches are played at the Valley Hub or Eagles 4040."
  IF NOT (s.venues @> ARRAY['Eagles 4040', 'Valley Hub']
          AND array_length(s.venues, 1) = 2) THEN
    failures := array_append(failures, format(
      'venues is %s, rulebook says exactly Eagles 4040 and Valley Hub', s.venues::text));
  END IF;

  -- "One unified ranking list across 8 Ball, 9 Ball, 10 Ball."
  IF NOT (s.disciplines @> ARRAY['8 Ball', '9 Ball', '10 Ball']
          AND array_length(s.disciplines, 1) = 3) THEN
    failures := array_append(failures, format(
      'disciplines is %s, rulebook says 8 Ball, 9 Ball and 10 Ball', s.disciplines::text));
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RULEBOOK SETTINGS: % SETTING(S) DO NOT MATCH README.md\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;
END $$;

-- The default matters as much as the value. The row above can be correct in a
-- database that has been hand-corrected while the column default still hands
-- the wrong number to the next environment built from this repo -- which is
-- precisely the state this file was written to end.
DO $$
DECLARE
  v_default text;
BEGIN
  SELECT column_default INTO v_default
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'league_settings'
     AND column_name  = 'challenge_expiry_days';

  IF v_default IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION
      'RULEBOOK SETTINGS: challenge_expiry_days DEFAULT is %, expected 2 -- a fresh row would not get the 48-hour rule',
      COALESCE(v_default, 'NULL');
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'RULEBOOK SETTINGS: ALL CHECKS PASSED'; END $$;
