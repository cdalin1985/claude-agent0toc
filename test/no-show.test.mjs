// The no-show rule, added to the board 2 August 2026:
//
//   "A no show w/o letting your opponent know will drop you to the challengers
//    original spot. Both players will swap spots in the standings."
//
// The behavioural proof is supabase/tests/migrations/13_no_show_swap_assert.sql,
// which performs real swaps on a real Postgres. These pin the two decisions a
// future edit could quietly undo, both of which are about who may do this to
// whom rather than about moving rows.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const migration = read('supabase/migrations/20260822150000_no_show_spot_swap.sql');
const fn = read('supabase/functions/report-no-show/index.ts');
const admin = read('src/pages/AdminPage.tsx');
const deploy = read('.github/workflows/deploy-edge-functions.yml');
const code = migration.replace(/^\s*--.*$/gm, '');

test('a no-show has its own cancel reason', () => {
  // Not 'withdrawn' and not 'wash' -- both of those are refunded or neutral.
  // The history has to show what actually happened.
  assert.match(code, /cancel_reason IN \('wash', 'withdrawn', 'overdue', 'no_show'\)/);
});

test('the swap can only ever move the no-show down', () => {
  // A top-10 player may challenge DOWN, so either player can be the no-show.
  // An unconditional swap would PROMOTE a lower-ranked player for not turning
  // up -- which is why this reads past the literal "both players will swap".
  assert.match(code, /IF v_no_show_pos < v_opp_pos THEN/);
});

test('a no-show needs a match that was actually arranged', () => {
  // You cannot fail to appear at something never scheduled. Enforced in the
  // function, not just the caller, because the function moves the ladder.
  assert.match(code, /IF v_challenge\.status NOT IN \('accepted', 'scheduled'\) THEN/);
});

test('players cannot apply it to each other', () => {
  // The whole reason this is admin-only: it is an accusation about somebody
  // else, and the penalty is a rank change.
  assert.match(code, /REVOKE ALL ON FUNCTION public\.apply_no_show_swap\(uuid, uuid\) FROM anon, authenticated;/);
  assert.match(code, /GRANT EXECUTE ON FUNCTION public\.apply_no_show_swap\(uuid, uuid\) TO service_role;/);
  assert.match(fn, /Only admins can record a no-show/);
  assert.match(fn, /\['admin', 'super_admin'\]\.includes\(actorProfile\.role\)/);
});

test('the ladder move happens in one locked call, not a sequence of writes', () => {
  // A half-applied swap leaves two players holding one position. The edge
  // function must not do the arithmetic itself.
  assert.match(code, /LOCK TABLE public\.rankings IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(fn, /\.rpc\('apply_no_show_swap'/);
  assert.doesNotMatch(fn, /from\('rankings'\)[\s\S]{0,120}\.update\(/);
});

test('the admin panel offers it only once a time was arranged', () => {
  assert.match(admin, /\['accepted', 'scheduled'\]\.includes\(c\.status\)/);
  assert.match(admin, /Record No-Show/);
});

test('a failed call does not close the panel as though the swap happened', () => {
  // A gateway 401 carries no `error` key, so testing json.error alone would
  // report a rank change that never occurred.
  assert.match(admin, /functions\/v1\/report-no-show/);
  assert.match(admin, /setActionError\(json\.error \?\? 'Could not record that no-show\.'\)/);
  // res.ok is tested, not just json.error.
  assert.match(admin, /const json = await res\.json\(\)\.catch\(\(\) => \(\{\}\)\);[\s\S]{0,200}!res\.ok \|\| json\.error/);
});

test('the new function is registered for deployment', () => {
  // A directory that exists but is not listed fails that workflow by design --
  // this keeps the failure at PR time rather than at deploy time.
  assert.match(deploy, /^\s*report-no-show:true$/m);
});
