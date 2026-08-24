// Two rulebook lines the app carried in prose and never enforced:
//
//   "match is a wash challenging player will sit for 24 hrs. The challenged
//    player may challenge up immediately"
//   "When an inactive player renters the list they must either defend or wait
//    7 days ... Exception last player on the list they must wait 24 hrs."
//
// The behavioural proof is supabase/tests/migrations/12_wash_and_return_cooldowns_assert.sql,
// which drives both against a real Postgres. These pin the wiring, which is
// where each rule can be quietly lost without any assertion noticing:
//
//   - a wash cooldown written for the wrong player, or on a withdrawal
//   - the return cooldown living only in the edge function, so any other write
//     path hands a returning player a clean slate
//   - the last-place exception dropped, which freezes the bottom of the ladder
//     out of the league for a week rather than a day

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const migration = read('supabase/migrations/20260822140000_wash_and_return_cooldowns.sql');
const respond = read('supabase/functions/respond-to-challenge/index.ts');
const code = migration.replace(/^\s*--.*$/gm, '');

test('the new cooldown types are allowed by the CHECK', () => {
  // Written before they can be inserted. Without this the RPC raises a check
  // violation and the wash silently 500s instead of sitting anybody.
  assert.match(code, /CHECK \(type IN \('post_match', 'post_decline', 'post_wash', 'post_return'\)\)/);
});

test('a wash sits the challenger and nobody else', () => {
  // The asymmetry is the rule. apply_wash_cooldown takes exactly one player id
  // and the caller passes the challenger; a version that also wrote one for the
  // challenged player would still pass a "was a cooldown written" check.
  assert.match(code, /FUNCTION public\.apply_wash_cooldown\(p_challenger_id uuid\)/);
  assert.match(respond, /apply_wash_cooldown', \{ p_challenger_id: challenge\.challenger_id \}/);
});

test('only a true wash costs the challenger, not a withdrawal', () => {
  // A challenge cancelled while still pending is recorded as 'withdrawn' -- the
  // challenger walking away before there was a time to disagree about. The
  // rulebook sits the challenger for a wash, and says nothing about that.
  assert.match(respond, /if \(cancelReason === 'wash'\) \{/);
});

test('the return cooldown is a trigger, not just an edge function', () => {
  // set-player-active is one way to flip is_active. A rule enforced only there
  // is a rule any other write path skips -- which is exactly why 20260812050000
  // moved three others into the database.
  assert.match(code, /CREATE TRIGGER apply_return_cooldown_trigger\s+AFTER UPDATE ON public\.players/);
  assert.match(code, /IF NEW\.is_active = true AND OLD\.is_active = false THEN/);
});

test('the last player on the list waits hours, not a week', () => {
  // With nobody below them there is no downward challenge available, so a
  // 7-day block on challenging up is a 7-day block on playing at all.
  assert.match(code, /IF v_position >= COALESCE\(v_last, v_position\) THEN/);
  assert.match(code, /v_expires := now\(\) \+ INTERVAL '7 days'/);
});

test('both helpers stay closed to players', () => {
  // Either one, callable by a member, is a way to sit a rival out.
  for (const fn of ['apply_wash_cooldown\\(uuid\\)', 'apply_return_cooldown\\(uuid\\)']) {
    assert.match(code, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn} FROM anon, authenticated;`));
    assert.match(code, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn} TO service_role;`));
  }
});
