// The 48-hour response window, and the three places it disagreed with itself.
//
// The rulebook: "The player being challenged must respond within 48 hours of
// the callout." One rule, one number. What the app actually had:
//
//   league_settings.challenge_expiry_days   DEFAULT 14, production 2
//   challenge_response_hours                48, and read by nothing at all
//   RulesPage fallback                      7
//   create-challenge fallback               7
//   ChallengePage fallback                  2
//
// Production was right by hand -- somebody typed 2 into the Admin panel in May
// and no migration ever recorded it -- so a database rebuilt from this repo
// gave members a fortnight to answer, and the Rules screen, which renders the
// value directly, would have said so.
//
// The database half is pinned by 18_settings_match_the_rulebook_assert.sql,
// which fails on the value AND on the column default. This is the client half:
// the fallbacks that decide what a member is told when settings cannot be read,
// and the Admin control that claimed to set this and did not.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const rulesPage = read('src/pages/RulesPage.tsx');
const challengePage = read('src/pages/ChallengePage.tsx');
const createChallenge = read('supabase/functions/create-challenge/index.ts');
const admin = read('src/pages/AdminPage.tsx');
const migration = read('supabase/migrations/20260825140000_challenge_expiry_matches_the_48_hour_rule.sql');

test('every fallback for the response window is the same number', () => {
  // Not "is a sensible number" -- is the SAME number. Three files disagreeing
  // is how a member sees "2 days" on one screen and "7 days" on another, both
  // rendered confidently, with no error anywhere.
  const fallbacks = [
    ['RulesPage', rulesPage],
    ['ChallengePage', challengePage],
    ['create-challenge', createChallenge],
  ];
  for (const [name, src] of fallbacks) {
    const m = src.match(/challenge_expiry_days \?\? (\d+)/);
    assert.ok(m, `${name} no longer has a challenge_expiry_days fallback`);
    assert.equal(
      m[1],
      '2',
      `${name} falls back to ${m[1]} days; the rulebook gives 48 hours`,
    );
  }
});

test('the migration fixes the column default, not just the row', () => {
  // A row corrected by hand in one database is not a rule the repo carries.
  // The default is what the next environment built from this repo receives.
  assert.match(migration, /ALTER COLUMN challenge_expiry_days SET DEFAULT 2/);
  assert.match(migration, /UPDATE public\.league_settings/);
});

test('the repair does not overwrite a deliberate admin setting', () => {
  // Scoped to rows still holding the original default. If the league decides on
  // some other number, this migration must not silently take it back.
  assert.match(migration, /WHERE challenge_expiry_days = 14/);
});

test('the Admin panel no longer offers a control that does nothing', () => {
  // challenge_response_hours was editable, labelled "Challenge response window
  // / hours to accept/decline", and read by nothing -- an admin could set it to
  // 24, watch it save, and change nothing about the league. Same defect as a
  // save button that always reports success.
  // Comments stripped first: the comment explaining WHY the dead control was
  // removed necessarily names it, and scanning the raw text would read that
  // explanation as the control still being there.
  const ruleFields = admin
    .slice(admin.indexOf('const RULE_FIELDS'), admin.indexOf('type SettingsFieldProps'))
    .replace(/^\s*\/\/.*$/gm, '');
  assert.ok(ruleFields.length > 0, 'could not find the admin rule fields');
  assert.doesNotMatch(
    ruleFields,
    /challenge_response_hours/,
    'the dead response-window control is back in the Admin panel',
  );
  // And the real one is labelled as what it is, rather than as "expiry".
  assert.match(ruleFields, /key: 'challenge_expiry_days'[^}]*label: 'Challenge response window'/);
});

test('the unused column is documented as unused, not quietly left to be found again', () => {
  // It stays in the table -- dropping a column is not a passing change -- so
  // the next person to read the schema needs to be told which of the two runs
  // the league.
  assert.match(migration, /COMMENT ON COLUMN public\.league_settings\.challenge_response_hours/);
  assert.match(migration, /UNUSED\. Nothing reads this column/);
});
