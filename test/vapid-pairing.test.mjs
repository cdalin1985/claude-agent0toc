// The VAPID key pair, checked by arithmetic instead of by waiting.
//
// A mismatched pair is the one push failure with no symptom until it matters:
// subscribing succeeds, the whole cron chain reports success, and delivery
// fails only when a real reminder is due -- as a 403 nobody is watching for.
// Every other link is checkable from a SQL prompt. This one was not, because
// sendPush looks for a subscription before it touches the keys, so with nobody
// subscribed the VAPID branch is unreachable by any probe.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const fn = readFileSync(join(root, 'supabase/functions/vapid-selftest/index.ts'), 'utf8');
// Comments legitimately name web-push (the tool that regenerates the pair) and
// describe push_subscriptions; only executable code decides what this contacts.
const code = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const deploy = readFileSync(join(root, '.github/workflows/deploy-edge-functions.yml'), 'utf8');

test('it proves the pair by signing and verifying, not by hoping import validates', () => {
  // Some implementations import a JWK without checking d against x/y, so the
  // pair is made to do the work it exists for.
  assert.match(fn, /crypto\.subtle\.sign\(/);
  assert.match(fn, /crypto\.subtle\.verify\(/);
  assert.match(fn, /paired = await crypto\.subtle\.verify/);
});

test('the public key is decomposed as an uncompressed P-256 point', () => {
  // 0x04 || x(32) || y(32). A key that is not that shape is reported as such
  // rather than throwing something unreadable.
  assert.match(fn, /pub\.length !== 65 \|\| pub\[0\] !== 0x04/);
  assert.match(fn, /pub\.slice\(1, 33\)/);
  assert.match(fn, /pub\.slice\(33, 65\)/);
});

test('it contacts no push service and needs no subscriber', () => {
  // The entire point: answerable with zero subscriptions.
  // Imports and calls, not the substring: the function legitimately tells an
  // admin to regenerate with "npx web-push generate-vapid-keys", and that
  // sentence is the fix, not a dependency.
  assert.doesNotMatch(code, /from\s+'npm:web-push'/);
  assert.doesNotMatch(code, /sendNotification\(/);
  assert.doesNotMatch(code, /from\('push_subscriptions'\)/);
});

test('it never returns or logs the private key', () => {
  assert.doesNotMatch(fn, /detail:.*privateKey/);
  assert.doesNotMatch(fn, /console\.(log|info|warn|error)\([^)]*privateKey/);
  // Booleans and prose only.
  assert.match(fn, /configured: true,\s*\n\s*paired,/);
});

test('it is not reachable by an ordinary member', () => {
  assert.match(fn, /isServiceRoleJwt\(token\)/);
  assert.match(fn, /\['admin', 'super_admin'\]\.includes\(profile\.role\)/);
  assert.match(fn, /if \(!authorised\) return json\(\{ error: 'Unauthorized' \}, 401\)/);
});

test('unconfigured is distinguished from mismatched', () => {
  // "Not set up yet" and "set up wrong" need different actions.
  assert.match(fn, /configured: false, missing/);
  assert.match(fn, /They are not a pair\./);
});

test('it reaches production', () => {
  // A function on disk that is absent from the deploy list never deploys.
  assert.match(deploy, /vapid-selftest:true/);
  assert.match(deploy, /vapid-selftest; do/);
});
