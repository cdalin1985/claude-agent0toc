// Who a name on the ladder belongs to.
//
// claim-player asked two questions and neither was about you: is this player
// unclaimed, and have you already claimed somebody else. So any signed-in
// account could take any unclaimed name off the public ladder. A claimed
// profile accepts challenges, declines them -- a forfeit, which hands over a
// spot -- and submits results, so this was not a cosmetic prank waiting to
// happen. With a sign-up link posted to a public Facebook page and 66 names
// sitting unclaimed, the first person through the door could have been anyone.
//
// The fix: an admin records the address each member signs in with, and a
// self-service claim has to match it.
//
// The database half is pinned by 19_roster_emails_assert.sql -- who can read
// and write the roster, and that it never reaches a public read path. This is
// the decision half, which that file cannot test because claim-player runs on
// the service role and bypasses RLS by design.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const claim = read('supabase/functions/claim-player/index.ts');
const addPlayer = read('supabase/functions/add-player/index.ts');
const migration = read('supabase/migrations/20260826120000_roster_emails_gate_self_service_claims.sql');
const admin = read('src/pages/AdminPage.tsx');
const claimPage = read('src/pages/ClaimPage.tsx');

const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('a claim is checked against the roster before it is written', () => {
  const c = code(claim);
  assert.match(c, /from\('player_roster_emails'\)/);
  // Order matters: the lookup has to sit before the update that sets
  // profile_id, or the gate is decoration on an already-claimed profile.
  const lookupAt = c.indexOf("from('player_roster_emails')");
  const writeAt = c.indexOf('.update({ profile_id: user.id })');
  assert.ok(lookupAt !== -1 && writeAt !== -1, 'could not find both the lookup and the claim write');
  assert.ok(lookupAt < writeAt, 'the roster lookup happens after the claim is written');
});

test('no address on file means no self-service claim', () => {
  // The failing-open version of this feature is worse than not having it: an
  // unclaimed name with nothing on file is precisely the one an impostor picks.
  const c = code(claim);
  assert.match(c, /if \(!rosterRow\?\.email\)/);
  assert.match(claim, /not set up for self sign-up yet/);
});

test('the comparison is case- and whitespace-insensitive on the token side', () => {
  // The column is CHECK-constrained to lowercase, but the address on the token
  // is whatever the member typed into the sign-in box. Comparing raw would
  // refuse "Dave@Example.com" against a correct roster entry.
  const c = code(claim);
  assert.match(c, /\(user\.email \?\? ''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(c, /signedInEmail !== rosterRow\.email/);
});

test('an empty address on the token cannot pass the check', () => {
  // `'' === ''` is true. Without the emptiness guard, a token carrying no email
  // would match a roster row that somehow held an empty string.
  assert.match(code(claim), /!signedInEmail \|\| signedInEmail !== rosterRow\.email/);
});

test('a refusal does not disclose the address on file', () => {
  // The caller here is by definition not the person the row belongs to. Saying
  // "we expected dave@..." hands a member's email to anyone who can read a name
  // off the public ladder.
  const refusal = claim.slice(claim.indexOf('That is not the email'), claim.indexOf('That is not the email') + 400);
  assert.doesNotMatch(refusal, /rosterRow\.email/);
});

test('inviting a player records the address as their roster email', () => {
  // The admin has just typed the address that belongs to this player. Not
  // capturing it leaves the two onboarding paths inconsistent: an invited
  // member is linked but has nothing on file, so a later re-claim is refused.
  const a = code(addPlayer);
  assert.match(a, /from\('player_roster_emails'\)\s*\n?\s*\.upsert\(\{/);
  assert.match(a, /onConflict: 'player_id'/);
});

test('a failed roster capture does not fail an invite that already linked', () => {
  // The account is linked by the time this runs. Throwing here would report
  // failure for an invite that worked.
  assert.match(addPlayer, /if \(rosterError\) console\.error/);
});

test('the address is not on players, where select(*) would ship it', () => {
  // This is the reason for a separate table. ClaimPage fetches the whole
  // players row for every unclaimed member, to anyone signed in.
  assert.match(claimPage, /from\('players'\)\s*\.select\('\*'\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.player_roster_emails/);
  assert.doesNotMatch(migration, /ALTER TABLE public\.players\s+ADD COLUMN[^;]*email/i);
});

test('the roster table is admin-only by policy and by grant', () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /role = ANY \(ARRAY\['admin', 'super_admin'\]\)/);
  assert.match(migration, /REVOKE ALL ON public\.player_roster_emails FROM anon;/);
});

test('an admin can see at a glance who cannot sign themselves up', () => {
  // A member with no address on file is refused by claim-player, so the admin
  // needs that visible next to the name rather than discoverable by a support
  // message from somebody who could not get in.
  assert.match(admin, /no sign-up email/);
  assert.match(admin, /from\('player_roster_emails'\)/);
});

test('a failed roster read is not rendered as "nobody has an email"', () => {
  // Same defect the Home screen had: an errored read rendering as a confident
  // empty answer. Here it would have an admin re-entering 66 addresses they
  // had already saved.
  assert.match(admin, /rosterError && \(/);
  assert.match(admin, /roster status below may be wrong/);
});

test('saving an address surfaces a duplicate rather than failing silently', () => {
  // One address, one member -- enforced by a unique index, so the collision
  // arrives as 23505 and has to be turned into something an admin can act on.
  assert.match(admin, /error\.code === '23505'/);
  assert.match(admin, /Another player already has that email on file/);
});
