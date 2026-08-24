// The inactivity demotion path had never once executed.
//
// process_inactive_demotions() has run daily since May and returned
// demoted_count 0 every time, because it only acts once somebody has been
// inactive 30 days and nobody had been. Every run "succeeded". The branch it
// never reached shifted rankings.position in place against a non-deferrable
// UNIQUE constraint, moving the first row of the block onto a position the
// demoted player had not yet vacated -- a guaranteed duplicate key.
//
// The real proof is supabase/tests/migrations/10_inactive_demotion_assert.sql,
// which performs an actual demotion on a real Postgres. These pin the shape of
// the fix so it cannot be quietly reverted to the in-place shift.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const migration = read('supabase/migrations/20260817101541_fix_inactive_demotion_position_shift.sql');
const assertFile = read('supabase/tests/migrations/10_inactive_demotion_assert.sql');
const rules = read('src/pages/RulesPage.tsx');

const code = migration.replace(/^\s*--.*$/gm, '');

test('the in-place shift that raised a duplicate key is gone', () => {
  // The exact statement that failed. rankings_position_key is UNIQUE and NOT
  // deferrable, so this is checked row by row, and the first row of the block
  // lands on the position the demoted player still holds.
  assert.doesNotMatch(code, /SET position = position - 1\b/);
});

test('positions are parked clear of the live ladder before being renumbered', () => {
  // Same technique cascade_ranking_after_win has used in production since May:
  // offset out of range, place the mover, bring the block back.
  assert.match(code, /position\s*=\s*position \+ 1000/);
  assert.match(code, /position\s*=\s*position - 1001/);
  assert.match(code, /BETWEEN \(1000 \+ v_current_pos \+ 1\) AND \(1000 \+ v_new_pos\)/);
});

test('the ranking lock is taken, as every other ladder mutator does', () => {
  // Demotions and match results both renumber the ladder; interleaving them
  // leaves it inconsistent.
  assert.match(code, /LOCK TABLE public\.rankings IN SHARE ROW EXCLUSIVE MODE/);
});

test('the function stays locked down after being replaced', () => {
  // SECURITY DEFINER and it renumbers the ladder. 20260612150000 guards its
  // lockdown behind IF-the-function-exists, which skips silently on a fresh
  // database, so the REVOKEs are repeated rather than assumed.
  assert.match(code, /SECURITY DEFINER/);
  assert.match(code, /REVOKE EXECUTE ON FUNCTION public\.process_inactive_demotions\(\) FROM PUBLIC;/);
  assert.match(code, /FROM authenticated;/);
});

test('the demotion rules themselves are untouched', () => {
  // Only the position shift was broken. The 30-day window, two spots per
  // elapsed month, and the cap at the bottom of the ladder all stay put.
  assert.match(code, /INTERVAL '30 days'/);
  assert.match(code, /\/ \(86400 \* 30\)\) \* 2/);
  assert.match(code, /least\(v_current_pos \+ v_drops_owed, v_total_players\)/);
});

test('the assert actually demotes somebody', () => {
  // A test that called the function against a healthy ladder would have passed
  // every day for three months while the demotion branch was broken.
  assert.match(assertFile, /result := public\.process_inactive_demotions\(\)/);
  assert.match(assertFile, /demoted_count/);
});

test('the assert covers both a mid-ladder demotion and the bottom cap', () => {
  // drops_owed = floor(days / 30) * 2.
  //
  //   45 days -> 2 owed, lands mid-ladder, everyone below is untouched
  //   62 days -> 4 owed, runs past the last position, least() caps it
  //
  // This file originally used 62 for the mid-ladder case on the belief that it
  // owed 2. It owes 4, so the demotion silently hit the cap, dragged the player
  // at the end of the block up with it, and the "nobody below moves" check
  // failed. Both durations are pinned here because the difference between them
  // is the whole point: one scenario proves the shift is bounded, the other
  // proves least() bounds it.
  assert.match(assertFile, /seed_demotion_block\(p1, p2, p3, p4, p5, 45\)/);
  assert.match(assertFile, /seed_demotion_block\(p1, p2, p3, p4, p5, 62\)/);
  assert.match(assertFile, /capped at the bottom of the ladder/);
});

test('the assert backdates inactivity in a second statement', () => {
  // on_player_inactivation overwrites inactivated_at with NOW() when is_active
  // flips, so setting both in one statement backdates nothing and the player
  // reads as inactive for zero days -- the demotion never runs and the test
  // proves nothing.
  assert.match(assertFile, /UPDATE players SET is_active = false WHERE id = p2;/);
  assert.match(assertFile, /UPDATE players SET inactivated_at = NOW\(\) - make_interval\(days => p_inactive_days\)/);

  // The point is not that a backdate exists, it is that the backdate is its own
  // statement. If it also set is_active, the BEFORE UPDATE trigger would stamp
  // inactivated_at = NOW() over it and the player would read as inactive for
  // zero days -- the demotion never runs and the assert proves nothing while
  // still reporting success.
  const backdate = assertFile.match(/UPDATE players SET inactivated_at[\s\S]*?;/);
  assert.ok(backdate, 'no backdate statement found');
  assert.ok(
    !/is_active/.test(backdate[0]),
    'the backdate statement must not also set is_active, or the trigger overwrites it',
  );
});

test('the assert checks the ladder is still intact afterwards', () => {
  // Landing the demoted player correctly is not enough: the rows around them
  // must have moved by exactly one, nobody outside the range may move, nothing
  // may be left parked at the offset, and no position may be doubly held.
  assert.match(assertFile, /a player outside the shifted block moved/);
  assert.match(assertFile, /left parked above 1000/);
  assert.match(assertFile, /held by more than one player/);
});

test('the Rules screen promise this backs is still on the page', () => {
  // If this claim is ever removed, the demotion feature is dead code and this
  // whole file should go with it.
  //
  // The page used to hedge -- "extended inactivity can result in ladder
  // demotion" -- which backed the feature without committing to a rate. It now
  // states the rulebook's actual terms, so this pins the number: a promise of
  // "2 spots for every 30 days" is the claim process_inactive_demotions has to
  // keep, and a weaker word would let the rate drift without failing here.
  assert.match(rules, /2 spots for every 30 days/);
  assert.match(rules, /Inactive more than 30 days/);
});

// ---------------------------------------------------------------------------
// The rate, not just the mechanics
// ---------------------------------------------------------------------------
// The shift above was fixed in August and the function still got the rule
// wrong: it derived the spots owed from elapsed time alone and applied them to
// the player's CURRENT position, recording nothing. The cron runs daily, so
// through days 30..59 it computed "2 owed" every single day and took two more
// spots each time -- a member owed 2 spots a month lost 2 a day.
//
// 10_'s assertions could not see it, because they call the function once and
// one call is the case the bug gets right. The proof is scenario C in
// 11_demotion_rate_assert.sql, which calls it twice; these pin the ledger the
// fix depends on so it cannot be dropped.

const rateMigration = read('supabase/migrations/20260822130000_demote_two_spots_per_30_days_not_per_day.sql');
const rateAssert = read('supabase/tests/migrations/11_demotion_rate_assert.sql');
const rateCode = rateMigration.replace(/^\s*--.*$/gm, '');

test('a ledger records what each spell of inactivity has already cost', () => {
  assert.match(rateCode, /ADD COLUMN IF NOT EXISTS inactive_drops_applied INTEGER NOT NULL DEFAULT 0/i);
});

test('the function charges the difference, not the whole debt', () => {
  // The distinction that is the entire fix: earned-minus-taken, rather than
  // earned applied to wherever the player currently sits.
  assert.match(rateCode, /v_drops_due\s*:=\s*v_drops_earned - COALESCE\(v_player\.inactive_drops_applied, 0\)/i);
  assert.match(rateCode, /IF v_drops_due > 0 THEN/i);
});

test('only the spots the ladder had room for are charged', () => {
  // least() can cap the landing spot at the bottom. Charging the full owed
  // amount there would forgive the remainder if the list later grew beneath
  // them; charging the actual movement keeps it owed.
  assert.match(rateCode, /v_drops_taken\s*:=\s*v_new_pos - v_current_pos/i);
  assert.match(rateCode, /SET inactive_drops_applied = COALESCE\(inactive_drops_applied, 0\) \+ v_drops_taken/i);
});

test('reactivation clears the ledger', () => {
  // Same lifetime as inactivated_at. Miss this and a member who returns and
  // later goes inactive again starts already paid up, and never drops at all.
  assert.match(rateCode, /NEW\.inactive_drops_applied = 0/);
});

test('the assert calls the function twice, which is the only way to see this', () => {
  assert.match(rateAssert, /second run inside the same 30-day bucket/i);
  assert.match(rateAssert, /two spots per 30 days, not per run/i);
});
