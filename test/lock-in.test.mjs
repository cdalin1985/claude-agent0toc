// The lock-in rule:
//
//   "If you defend your spot you may challenge up immediately which means you
//    must include a challenge with your results to lock in a challenge if you
//    do not you are open to challenges from behind until you do so."
//
// Read as pure description that last clause does nothing -- in the app everyone
// is always challengeable. It only means something if locking in STOPS you
// being open from behind, so a locked-in challenge is a shield.
//
// The behavioural proof is supabase/tests/migrations/14_lock_in_assert.sql.
// These pin the three distinctions that separate this rule from a rule that
// merely looks like it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const migration = read('supabase/migrations/20260822160000_lock_in_a_challenge_after_defending.sql');
const createChallenge = read('supabase/functions/create-challenge/index.ts');
const assertFile = read('supabase/tests/migrations/14_lock_in_assert.sql');
const code = migration.replace(/^\s*--.*$/gm, '');

test('only the challenged player earns the right by winning', () => {
  // Defending is winning as the CHALLENGED player. A top-10 player who
  // challenges down and wins attacked; nothing was defended. Drop this
  // comparison and every winner earns a shield.
  assert.match(code, /NEW\.winner_id = v_challenged_id/);
});

test('the right is granted by a trigger, not by one of the three finish paths', () => {
  // submit-result, resolve-dispute and an admin forfeit all finish matches. A
  // rule written into one is a rule the other two skip.
  assert.match(code, /CREATE TRIGGER grant_lock_in_right_trigger\s+AFTER UPDATE ON public\.matches/);
  // Only on the transition, so re-touching a confirmed row cannot re-grant a
  // right the player has already spent.
  assert.match(code, /IF OLD\.status IS NOT DISTINCT FROM NEW\.status THEN/);
});

test('a locked-in challenge shields its challenger, and an ordinary one does not', () => {
  // The `locked_in = true` filter is the whole distinction. Without it this
  // becomes "anyone holding an outgoing challenge is unchallengeable", which
  // would let a player stay permanently immune.
  assert.match(code, /WHERE challenger_id = NEW\.challenged_id\s*\n\s*AND locked_in = true/);
  assert.match(code, /CREATE TRIGGER reject_challenge_against_locked_in\s+BEFORE INSERT ON public\.challenges/);
});

test('being challenged first lapses the right, in the same statement', () => {
  // The other half of the sentence. Done in the insert rather than the edge
  // function so there is no window in which two players believe they hold the
  // same opening.
  assert.match(code, /SET lock_in_right = false\s*\n\s*WHERE id = NEW\.challenged_id AND lock_in_right = true/);
});

test('the right is spent only once the challenge actually exists', () => {
  // Clearing it before the insert would burn the right on a challenge refused
  // by the range check, the weekly limit or a cooldown.
  assert.match(createChallenge, /const lockedIn = challenger\.lock_in_right === true;/);
  assert.match(createChallenge, /locked_in: lockedIn/);
  const spendIndex = createChallenge.indexOf("update({ lock_in_right: false })");
  const insertIndex = createChallenge.indexOf('.from(\'challenges\').insert(');
  assert.ok(spendIndex > insertIndex && insertIndex !== -1, 'the right must be cleared after the insert, not before');
});

test('the shield gives a sentence rather than a constraint error', () => {
  // Both the pre-read and the lost-race path name the rule.
  assert.match(createChallenge, /defended their spot and locked in a challenge/);
  assert.match(createChallenge, /insertErr\.code === '23514'/);
});

test('the assert distinguishes a locked challenge from an ordinary one', () => {
  assert.match(assertFile, /an unlocked outgoing challenge shielded its challenger/);
  assert.match(assertFile, /challenging down and winning is not defending/);
});
