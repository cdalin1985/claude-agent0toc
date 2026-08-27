// Who a name on the ladder belongs to.
//
// claim-player asked two questions and neither was about you: is this player
// unclaimed, and have you already claimed somebody else. So any signed-in
// account could take any unclaimed name off the public ladder. A claimed
// profile accepts challenges, declines them -- a forfeit, which hands over a
// spot -- and submits results, so this was not a cosmetic prank waiting to
// happen.
//
// The first fix required an admin to record every member's address up front.
// That is the wrong shape for TOC: it means collecting 66 addresses before
// anybody can sign in at all, and members onboard at the table, not by
// spreadsheet. So the rule is now per player, and the admin picks:
//
//   pinned  -- an address is on file, and only that address can claim the name
//   open    -- nothing on file, any signed-in account can claim it
//
// Open is a real risk and is paid for rather than denied. Every claim writes an
// audit row saying whether it was checked, posts to the public activity feed,
// and notifies every admin; release-claim puts it back in one tap. Prevention
// for pinned names, detection and reversal for the rest.
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
const release = read('supabase/functions/release-claim/index.ts');
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

test('an address on file is binding: only it can claim that name', () => {
  // The pinned half. If an admin has said who a name belongs to, a claim that
  // does not match is refused -- this is the part that must not regress into
  // "the address is advisory".
  const c = code(claim);
  assert.match(c, /const isPinned = Boolean\(rosterRow\?\.email\)/);
  assert.match(c, /if \(isPinned && \(!signedInEmail \|\| signedInEmail !== rosterRow\.email\)\)/);
});

test('no address on file means the claim goes through', () => {
  // The open half, asserted explicitly so nobody "fixes" it back to failing
  // closed without reading why. Collecting 66 addresses before anybody can sign
  // in is the cost this deliberately refuses to pay.
  const c = code(claim);
  assert.doesNotMatch(c, /if \(!rosterRow\?\.email\)/);
  assert.doesNotMatch(claim, /not set up for self sign-up yet/);
  // The refusal is reachable only when a name is pinned.
  const refusalAt = c.indexOf('That is not the email');
  const pinnedAt = c.indexOf('if (isPinned &&');
  assert.ok(pinnedAt !== -1 && refusalAt !== -1 && pinnedAt < refusalAt,
    'the refusal is no longer guarded by isPinned');
});

test('a failed roster read is not treated as "nothing on file"', () => {
  // The dangerous middle case. If the lookup errors and that falls through to
  // the open path, a transient database blip becomes an open door on a name an
  // admin deliberately pinned. It has to refuse instead.
  const c = code(claim);
  const errAt = c.indexOf('if (rosterError)');
  const pinnedAt = c.indexOf('const isPinned');
  assert.ok(errAt !== -1 && errAt < pinnedAt, 'the roster read error is handled after the open/pinned decision');
  assert.match(c, /if \(rosterError\) \{[\s\S]{0,400}status: 500/);
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

test('every claim records whether it was actually checked', () => {
  // With two rules in play, "a claim happened" is not enough. The audit row has
  // to say which rule applied, or an unverified claim is indistinguishable from
  // a verified one after the fact.
  const c = code(claim);
  assert.match(c, /action: 'claim_player'/);
  assert.match(c, /matched_roster_email: isPinned/);
});

test('an unverified claim is announced, not just logged', () => {
  // An audit table nobody opens is not a safety net. The claim has to reach the
  // public feed and every admin's notifications the moment it happens.
  const c = code(claim);
  assert.match(c, /from\('activity_feed'\)\s*\.insert\(\{/);
  assert.match(c, /event_type: 'player_claimed'/);
  assert.match(c, /from\('notifications'\)\.insert\(rows\)/);
  assert.match(c, /\.in\('role', \['admin', 'super_admin'\]\)/);
  // The two cases must read differently or the alert says nothing useful.
  assert.match(claim, /Profile claimed — not verified/);
});

test('the claim alert cannot be switched off in preferences', () => {
  // notification_category returns NULL for an unknown type and
  // player_accepts_notification treats NULL as "deliver". That is load-bearing:
  // a security alert routed into an existing category could be muted by the
  // admin it is meant to warn.
  assert.match(code(claim), /type: 'player_claimed'/);
  assert.doesNotMatch(code(claim), /type: '(challenge_|match_|result_|rank_change|player_invited)/);
});

test('an admin can put a claim back', () => {
  const r = code(release);
  assert.match(r, /\.update\(\{ profile_id: null \}\)/);
  assert.match(r, /action: 'admin_released_claim'/);
  // Same atomic shape as the claim: scoped to the profile that held it, so a
  // fresh claim made in between is not silently clobbered.
  assert.match(r, /\.eq\('profile_id', target\.profile_id\)/);
});

test('only admins can release a claim, and the check fails closed', () => {
  const r = code(release);
  assert.match(r, /\['admin', 'super_admin'\]\.includes\(actorProfile\.role\)/);
  // An unreadable profile is not an admin.
  assert.match(r, /if \(actorError\) \{[\s\S]{0,200}500\);/);
  assert.match(r, /if \(!actorProfile \|\| !\['admin', 'super_admin'\]/);
});

test('releasing runs on the service role, because the column guard blocks it', () => {
  // guard_privilege_columns raises on any change to players.profile_id and
  // bypasses only for the service role. A SECURITY DEFINER RPC would not help:
  // the guard reads request.jwt.claims, which still says 'authenticated'.
  assert.match(release, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('an admin cannot release the super admin out of their own league', () => {
  assert.match(code(release), /holderProfile\?\.role === 'super_admin' && actorProfile\.role !== 'super_admin'/);
});

test('inviting a player records the address as their roster email', () => {
  // The admin has just typed the address that belongs to this player. Not
  // capturing it leaves the two onboarding paths inconsistent: an invited
  // member is linked but has nothing on file, so a later re-claim is open.
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

test('an admin can see at a glance which names are open', () => {
  // Under two rules the interesting fact is which one a name is under. "Open to
  // anyone signed in" is the state an admin may want to close before handing
  // the sign-up link to a public page.
  assert.match(admin, /open to anyone signed in/);
  assert.match(admin, /locked to /);
  assert.match(admin, /from\('player_roster_emails'\)/);
});

test('the admin list offers the undo next to the claim', () => {
  assert.match(admin, /Release claim/);
  assert.match(admin, /functions\/v1\/release-claim/);
});

test('a failed roster read is not rendered as "nobody has an email"', () => {
  // Same defect the Home screen had: an errored read rendering as a confident
  // empty answer. Here it would have an admin re-entering addresses they had
  // already saved.
  assert.match(admin, /rosterError && \(/);
  assert.match(admin, /roster status below may be wrong/);
});

test('saving an address surfaces a duplicate rather than failing silently', () => {
  // One address, one member -- enforced by a unique index, so the collision
  // arrives as 23505 and has to be turned into something an admin can act on.
  assert.match(admin, /error\.code === '23505'/);
  assert.match(admin, /Another player already has that email on file/);
});
