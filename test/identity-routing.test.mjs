// The routing decision that decides whether a member gets into the app.
//
// These call the function. The bug they exist to prevent survived every
// existing test in this suite, because nothing here had ever executed the
// guard -- it lived inside a useEffect and was only ever read by eye.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const { routeForIdentity } = await import('../src/lib/routeForIdentity.ts');

const at = (path, overrides = {}) => ({
  path,
  hasSession: true,
  hasPlayer: true,
  identityStatus: 'resolved',
  ...overrides,
});

// --- The regression itself -------------------------------------------------

test('a failed identity read never routes anyone to Claim', () => {
  // This is the whole bug. `hasPlayer: false` here does not mean "unclaimed",
  // it means "we asked and got an error". A claimed member sent to /claim finds
  // a list their own name is not on, because they already took it.
  for (const path of ['/', '/rankings', '/challenges', '/match/abc', '/settings']) {
    assert.equal(
      routeForIdentity(at(path, { hasPlayer: false, identityStatus: 'failed' })),
      null,
      `${path} redirected on a failed identity read`,
    );
  }
});

test('an identity read still in flight never routes anyone to Claim', () => {
  assert.equal(routeForIdentity(at('/', { hasPlayer: false, identityStatus: 'unknown' })), null);
});

test('a member whose identity is already known is unaffected by a later failure', () => {
  // `hasPlayer` survives a failed refresh, and knowing who someone is does not
  // stop being true because a later request timed out.
  assert.equal(routeForIdentity(at('/', { identityStatus: 'failed' })), null);
  assert.equal(routeForIdentity(at('/rankings', { identityStatus: 'failed' })), null);
});

// --- The behaviour that must survive the fix -------------------------------

test('a genuinely unclaimed member is still sent to Claim', () => {
  // The fix must not buy safety by breaking onboarding: a resolved read that
  // found no player row is a real answer and must still route.
  assert.equal(routeForIdentity(at('/', { hasPlayer: false })), '/claim');
  assert.equal(routeForIdentity(at('/rankings', { hasPlayer: false })), '/claim');
});

test('an unclaimed member already on Claim is left there', () => {
  assert.equal(routeForIdentity(at('/claim', { hasPlayer: false })), null);
});

test('a claimed member is bounced off Claim', () => {
  assert.equal(routeForIdentity(at('/claim')), '/');
});

test('a signed-out visitor goes to login from anywhere private', () => {
  assert.equal(routeForIdentity(at('/', { hasSession: false })), '/login');
  assert.equal(routeForIdentity(at('/claim', { hasSession: false })), '/login');
  // Even with stale identity left in the store.
  assert.equal(
    routeForIdentity(at('/rankings', { hasSession: false, identityStatus: 'failed' })),
    '/login',
  );
});

test('public paths are never redirected, whatever the identity state', () => {
  for (const status of ['unknown', 'resolved', 'failed']) {
    for (const path of ['/login', '/auth/callback']) {
      assert.equal(routeForIdentity(at(path, { hasSession: false, hasPlayer: false, identityStatus: status })), null);
    }
  }
});

// --- The read that feeds it ------------------------------------------------

test('the identity read distinguishes no-row from failed', () => {
  const layout = readFileSync(join(process.cwd(), 'src/components/Layout.tsx'), 'utf8');
  // .single() turns "no rows" into an error, which is indistinguishable from a
  // real failure without matching on PGRST116. .maybeSingle() reserves `error`
  // for actual failures, which is what makes the tri-state honest.
  assert.match(layout, /from\('players'\)[^\n]*\.maybeSingle\(\)/);
  assert.match(layout, /from\('profiles'\)[^\n]*\.maybeSingle\(\)/);
  assert.doesNotMatch(layout, /from\('players'\)[^\n]*\.single\(\)/);
  // The error must set the failed state, not be dropped on the floor.
  assert.match(layout, /setIdentityStatus\('failed'\)/);
  assert.match(layout, /setIdentityStatus\('resolved'\)/);
});

test('signing out clears the identity state', () => {
  const store = readFileSync(join(process.cwd(), 'src/stores/authStore.ts'), 'utf8');
  // A stale 'resolved' surviving a sign-out would let the next visitor be
  // routed on the previous one's identity.
  assert.match(store, /reset: \(\) => set\(\{[^}]*identityStatus: 'unknown'/s);
});

// --- create-challenge's answer when the database refuses the insert ---------

test('losing the one-active-challenge race is explained, not called a server error', async () => {
  const source = readFileSync(join(process.cwd(), 'supabase/functions/create-challenge/index.ts'), 'utf8');
  // 23505 is unique_violation. The two maybeSingle() reads above the insert
  // fail open (maybeSingle errors on >1 row, and the errors are discarded), so
  // the indexes are the real guard and a player can genuinely reach them.
  assert.match(source, /insertErr\.code === '23505'/);
  // Told the rule, with the right side of it, and a 409 rather than a 500 --
  // "try again" on a 500 is an invitation to retry something that cannot work.
  assert.match(source, /idx_challenges_one_active_per_challenged/);
  assert.match(source, /You already have an active outgoing challenge\./);
  assert.match(source, /That player already has an active challenge they must resolve first\./);
  assert.match(source, /if \(insertErr\.code === '23505'\)[\s\S]*?status: 409/);
  // Anything that is not that must still reach the catch, which logs the real
  // Postgres error and returns something a member can act on.
  assert.match(source, /\}\s*\n\s*throw insertErr;\s*\n\s*\}/);
});
