// The last link in the push chain, made checkable.
//
// Everything from pg_cron through pg_net to the edge function is verifiable
// from a SQL prompt -- and was, on 2026-09-01. VAPID signing to a real handset
// is not: sendPush() looks for a subscription BEFORE it touches the VAPID keys,
// so with nobody subscribed that branch is unreachable by any probe, and a
// mismatched key pair stays invisible until the first real match reminder fails
// to arrive.
//
// send-test-push exists to collapse that unknown into one tap.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');
const fn = read('supabase/functions/send-test-push/index.ts');
const settings = read('src/pages/SettingsPage.tsx');
const sendPush = read('supabase/functions/_shared/sendPush.ts');

test('it can only ever push to the caller', () => {
  // No player_id parameter anywhere: the target is derived from the session, so
  // this cannot be turned into a way to notify somebody else.
  assert.match(fn, /\.eq\('profile_id', user\.id\)/);
  assert.doesNotMatch(fn, /req\.json\(\)/);
  assert.doesNotMatch(fn, /player_id:\s*(?!player\.id)/);
});

test('it requires a session', () => {
  assert.match(fn, /supabase\.auth\.getUser\(token\)/);
  assert.match(fn, /if \(!user\) return json\(\{ error: 'Unauthorized' \}, 401\)/);
});

test('server misconfiguration is reported before "you never subscribed"', () => {
  // Reporting no_subscription when the real fault is an unset VAPID key sends
  // the member to toggle a switch that was never the problem.
  const cfg = fn.indexOf("reason: 'not_configured'");
  const sub = fn.indexOf("reason: 'no_subscription'");
  assert.ok(cfg !== -1 && sub !== -1 && cfg < sub);
});

test('a key-pair mismatch is named, not swallowed', () => {
  // 403 from the push service means the JWT was signed with a private key that
  // does not match the public key the browser subscribed with. This is the
  // failure this endpoint exists to surface -- it is otherwise invisible until
  // a real reminder is due.
  assert.match(fn, /err\.statusCode === 403/);
  assert.match(fn, /reason: 'vapid_mismatch'/);
  assert.match(fn, /do not match the one this browser subscribed with/);
});

test('an expired subscription is cleared so the retry can succeed', () => {
  // 404/410 mean the browser discarded it. Keeping it guarantees failure on
  // every future send.
  assert.match(fn, /err\.statusCode === 404 \|\| err\.statusCode === 410/);
  assert.match(fn, /delete\(\)\.eq\('player_id', player\.id\)/);
  assert.match(fn, /reason: 'subscription_expired'/);
});

test('the production push path stays silent, unlike this one', () => {
  // sendPush must never break the challenge or result that triggered it, so it
  // swallows to the log and returns void. That is correct there and useless for
  // diagnosis, which is why this endpoint is separate rather than a flag on it.
  assert.match(sendPush, /Promise<void>/);
  assert.doesNotMatch(sendPush, /reason: '/);
});

test('the button only appears once subscribed, and shows the reason', () => {
  assert.match(settings, /pushSupported && pushSubscribed && \(/);
  assert.match(settings, /send-test-push/);
  assert.match(settings, /pushTestResult\.message/);
  // Success and failure must not look the same.
  assert.match(settings, /pushTestResult\.ok \? 'text-\[#10B981\]' : 'text-\[#F59E0B\]'/);
});

test('the result is announced to a screen reader', () => {
  const block = settings.slice(settings.indexOf('pushTestResult && ('));
  assert.match(block.slice(0, 400), /role="status"/);
});
