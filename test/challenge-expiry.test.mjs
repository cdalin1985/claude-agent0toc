// Challenge expiry: the scheduler, the server guard, and the screen.
//
// expire_stale_challenges() has been correct since May 2026 and did nothing,
// because nothing called it on a schedule. Its only caller was the very
// operation it exists to unblock. A test asserting the function existed would
// have passed the entire time -- so these pin the WIRING, which is what was
// missing, and the runtime behaviour lives in
// supabase/tests/migrations/09_challenge_expiry_assert.sql where a real
// Postgres can run it.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const migration = read('supabase/migrations/20260817095214_expire_challenges_on_a_schedule.sql');
const respond = read('supabase/functions/respond-to-challenge/index.ts');
const createChallenge = read('supabase/functions/create-challenge/index.ts');
const challengesPage = read('src/pages/ChallengesPage.tsx');
const expiryAssert = read('supabase/tests/migrations/09_challenge_expiry_assert.sql');

// Comments explain what a string used to say; only rendered code decides what a
// member reads. Asserting a phrase is absent has to look at the latter, or the
// comment recording the fix trips the test that proves the fix.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const challengesPageCode = stripComments(challengesPage);

// --- the schedule ---------------------------------------------------------

test('the sweeper is scheduled, which is the whole bug', () => {
  assert.match(migration, /cron\.schedule\(\s*'challenge-expiry-check'/);
  assert.match(migration, /'\*\/15 \* \* \* \*'/);
  assert.match(migration, /SELECT public\.expire_stale_challenges\(\)/);
});

test('the inactive-demotion job production already runs is written down', () => {
  // 20260813200000 restored process_inactive_demotions() and missed its
  // schedule, so a rebuilt database had the function and no caller.
  assert.match(migration, /cron\.schedule\(\s*'inactive-demotion-check'/);
  assert.match(migration, /SELECT public\.process_inactive_demotions\(\)/);
});

test('scheduling is idempotent and survives a database without pg_cron', () => {
  // CI replays every migration against a plain Postgres 17. Without the
  // extension guard this migration fails the build; without the unschedule it
  // fails the second application.
  assert.match(migration, /IF EXISTS \(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'\)/);
  assert.match(migration, /cron\.unschedule\('challenge-expiry-check'\)/);
  assert.match(migration, /cron\.unschedule\('inactive-demotion-check'\)/);
});

test('the migration does not redefine the function it schedules', () => {
  assert.doesNotMatch(migration, /CREATE (OR REPLACE )?FUNCTION/i);
});

// --- the server guard -----------------------------------------------------

test('respond-to-challenge sweeps before it reads the challenge', () => {
  const sweep = respond.indexOf("rpc('expire_stale_challenges')");
  const fetchRow = respond.indexOf("from('challenges').select('*')");
  assert.ok(sweep !== -1, 'respond-to-challenge never calls expire_stale_challenges');
  assert.ok(fetchRow !== -1, 'could not find the challenge fetch');
  assert.ok(sweep < fetchRow, 'the sweep must run before the read, or the row carries a stale status');
});

test('an expired challenge is refused with 409', () => {
  assert.match(respond, /challenge\.status === 'expired' && action !== 'cancel'/);
  assert.match(respond, /This challenge expired on \$\{formatLeagueDateTime\(challenge\.expires_at\)\}/);
  assert.match(respond, /status: 409/);
});

test('the expiry message carries no raw ISO timestamp', () => {
  // Members read this. formatLeagueDateTime renders league time; interpolating
  // expires_at directly would print a UTC ISO string, which was fixed once
  // already and must not come back.
  const guard = respond.slice(
    respond.indexOf("challenge.status === 'expired'"),
    respond.indexOf("challenge.status === 'expired'") + 400,
  );
  assert.doesNotMatch(guard, /\$\{challenge\.expires_at\}/);
});

test('cancel stays available on an expired challenge', () => {
  // The challenger clearing their own dead challenge harms nobody. If this
  // guard ever drops the `action !== 'cancel'` clause, an expired outgoing
  // challenge becomes impossible to tidy away.
  assert.match(respond, /action !== 'cancel'/);
});

test('expiry stays penalty-free', () => {
  // League ruling: an expired challenge costs the ignoring player nothing and
  // does not consume one of the challenger's weekly slots. Declining is a
  // forfeit; ignoring is not. Blocking decline past expiry is what stops the
  // forfeit being applied to a challenge that should carry no penalty.
  assert.match(createChallenge, /if \(row\.status === 'expired'\) return false;/);
});

// --- the screen -----------------------------------------------------------

test('the screen can tell "expires within the hour" from "expired days ago"', () => {
  // hours_left floors at 0, so it cannot distinguish the two on its own --
  // which is how "Expiring soon" came to sit on challenges that were dead.
  assert.match(challengesPage, /is_expired: new Date\(challenge\.expires_at\)\.getTime\(\) <= now/);
  assert.match(challengesPage, /hours_left: number; is_expired: boolean/);
});

test('an expired challenge no longer claims to be expiring soon', () => {
  assert.doesNotMatch(challengesPageCode, /Expiring soon/);
  assert.match(challengesPageCode, /c\.status === 'pending' && c\.is_expired/);
  assert.match(challengesPageCode, /Expired — no penalty to either player/);
});

test('the screen does not offer an action the server will refuse', () => {
  assert.match(challengesPage, /tab === 'incoming' && c\.status === 'pending' && !c\.is_expired/);
});

// --- the runtime assert ---------------------------------------------------

test('the SQL assert proves behaviour, not existence', () => {
  assert.match(expiryAssert, /SELECT public\.expire_stale_challenges\(\) INTO swept/);
  // The negative case is what stops the file passing if the sweeper expired
  // every challenge in the league.
  assert.match(expiryAssert, /the sweeper is eating live challenges/);
  assert.match(expiryAssert, /a second sweep changed an already-expired challenge/);
});

test('the SQL assert is re-runnable, because CI runs it twice', () => {
  assert.match(expiryAssert, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(expiryAssert, /ON CONFLICT \(id\) DO UPDATE/);
});

test('assert files are picked up by the replay glob', () => {
  // The workflow globs [0-9][0-9]_*_assert.sql. A file named outside that
  // pattern is silently never run -- which has happened here before.
  const files = readdirSync(join(root, 'supabase/tests/migrations'));
  assert.ok(
    files.includes('09_challenge_expiry_assert.sql'),
    'the new assert file must match the NN_*_assert.sql glob to be executed by CI',
  );
});
