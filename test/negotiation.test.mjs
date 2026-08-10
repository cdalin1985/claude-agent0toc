import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const migration = read('supabase', 'migrations', '20260807140000_challenge_scheduling_proposals.sql');
const respondToChallenge = read('supabase', 'functions', 'respond-to-challenge', 'index.ts');
const challengesPage = read('src', 'pages', 'ChallengesPage.tsx');
const notificationsPage = read('src', 'pages', 'NotificationsPage.tsx');
const databaseTypes = read('src', 'types', 'database.ts');
const sqlAssert = read('supabase', 'tests', 'migrations', '02_negotiation_assert.sql');
const workflow = read('.github', 'workflows', 'migration-replay-check.yml');

// --- Data model -------------------------------------------------------------

test('proposals are rows so the negotiation keeps its history', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.challenge_proposals/i);
  assert.match(migration, /proposed_by_player_id UUID NOT NULL REFERENCES public\.players\(id\)/i);
  assert.match(migration, /CHECK \(status IN \('pending', 'accepted', 'superseded'\)\)/i);
  assert.match(migration, /ON DELETE CASCADE/i);
});

test('at most one live proposal per challenge, which is what makes turn order answerable', () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_challenge_proposals_one_pending\s*\n\s*ON public\.challenge_proposals\(challenge_id\)\s*\n\s*WHERE status = 'pending'/i,
  );
});

test('the negotiation log is readable by members but writable only by the function', () => {
  assert.match(migration, /ALTER TABLE public\.challenge_proposals ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /CREATE POLICY "Anyone can view challenge proposals"\s*\n\s*ON public\.challenge_proposals FOR SELECT USING \(true\)/i);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.challenge_proposals FROM anon, authenticated/i);
  assert.match(migration, /GRANT ALL ON public\.challenge_proposals TO service_role/i);
  // No write policy may exist — the REVOKE is the gate, a policy would reopen it.
  assert.doesNotMatch(migration, /CREATE POLICY[^;]*challenge_proposals FOR (INSERT|UPDATE|DELETE)/i);
});

test('the challenge status vocabulary is reused rather than widened on a live table', () => {
  // 'accepted' was already permitted by challenges_status_check and never written.
  assert.doesNotMatch(migration, /challenges_status_check/i);
  assert.doesNotMatch(migration, /ALTER TABLE public\.challenges[\s\S]{0,80}(ADD|DROP) CONSTRAINT/i);
});

// --- Turn order and state transitions --------------------------------------

test('the legacy one-shot accept becomes a proposal instead of breaking', () => {
  // An old cached PWA bundle still posts action:'accept'.
  assert.match(respondToChallenge, /if \(action === 'propose' \|\| action === 'accept'\) \{/);
});

test('a player cannot counter their own outstanding proposal', () => {
  assert.match(respondToChallenge, /if \(liveProposal && liveProposal\.proposed_by_player_id === callerPlayer\.id\) \{/);
  assert.match(respondToChallenge, /it's their turn to reply/);
});

test('the challenged player gets the first word on when and where', () => {
  assert.match(respondToChallenge, /if \(challenge\.status === 'pending' && !isChallenged\) \{/);
});

test('countering supersedes the live proposal rather than leaving two open', () => {
  assert.match(respondToChallenge, /\.update\(\{ status: 'superseded', responded_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(respondToChallenge, /\.eq\('id', liveProposal\.id\)\s*\n\s*\.eq\('status', 'pending'\)/);
});

test('accepting claims the proposal before creating the match', () => {
  // The proposal row is the narrowest thing to race on; winning it is what
  // entitles the request to schedule.
  assert.match(respondToChallenge, /const \{ data: claimedProposal, error: claimError \} = await supabase/);
  assert.match(respondToChallenge, /\.update\(\{ status: 'accepted', responded_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(respondToChallenge, /if \(!claimedProposal\?\.length\) \{/);
  // And the challenge transition is itself a compare-and-swap.
  assert.match(respondToChallenge, /\.eq\('status', 'accepted'\)\s*\n\s*\.select\('id'\);/);
});

test('you cannot accept your own suggestion', () => {
  assert.match(respondToChallenge, /if \(proposal\.proposed_by_player_id === callerPlayer\.id\) \{/);
  assert.match(respondToChallenge, /you're waiting on them/i);
});

test('scheduling still writes the play-window deadline from league settings', () => {
  assert.match(respondToChallenge, /const matchPlayDays = settings\?\.match_play_days \?\? 10;/);
  assert.match(respondToChallenge, /match_deadline: matchDeadline,/);
});

test('every negotiation step is guarded by a real HTTP status, not a bare 200', () => {
  const proposeBranch = respondToChallenge.match(/action === 'propose' \|\| action === 'accept'[\s\S]*?action === 'accept_proposal'/);
  assert.ok(proposeBranch, 'expected a propose branch');
  assert.ok((proposeBranch[0].match(/status: 40\d/g) ?? []).length >= 4);
});

// --- Notifications, push and the public log ---------------------------------

test('every proposal and counter reaches the other player', () => {
  assert.match(respondToChallenge, /const otherId = isChallenger \? challenge\.challenged_id : challenge\.challenger_id;/);
  assert.match(respondToChallenge, /title: countering \? '🗓️ New time suggested' : '✅ Challenge answered',/);
  assert.match(respondToChallenge, /await sendPush\(\s*\n?\s*supabase,\s*\n?\s*otherId,/);
});

test('agreeing tells both players, since it is the moment the match becomes real', () => {
  assert.match(respondToChallenge, /'🎱 Match locked in'/);
  const lockedIn = respondToChallenge.match(/from\('notifications'\)\.insert\(\[[\s\S]*?\]\)/);
  assert.ok(lockedIn, 'expected a two-row notification insert on agreement');
  assert.match(lockedIn[0], /player_id: otherId/);
  assert.match(lockedIn[0], /player_id: callerPlayer\.id/);
});

test('scheduling is logged publicly, as the product owner asked', () => {
  assert.match(respondToChallenge, /countered with a new time against/);
  assert.match(respondToChallenge, /working out a time/);
  assert.match(respondToChallenge, /is on — \$\{when\}/);
});

test('every write in the negotiation paths checks its error', () => {
  for (const name of ['liveError', 'supersedeError', 'proposalError', 'statusError', 'proposalReadError', 'claimError', 'updateError', 'insertError', 'notificationError', 'activityError']) {
    assert.match(respondToChallenge, new RegExp(`if \\(${name}\\) throw ${name};`), `${name} is not checked`);
  }
});

// --- Negotiation cannot outlive the challenge -------------------------------

test('a challenge being scheduled still expires on its response deadline', () => {
  // Otherwise trading counter-proposals keeps the challenge — and both players'
  // weekly slots — alive forever.
  assert.match(migration, /WHERE status IN \('pending', 'accepted'\)\s*\n\s*AND expires_at <= NOW\(\)/i);
  assert.match(migration, /closed_proposals AS \(/i);
  assert.match(migration, /SET status\s*=\s*'superseded',/i);
});

test('expire_stale_challenges stays locked to service_role after redefinition', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.expire_stale_challenges\(\) FROM anon, authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.expire_stale_challenges\(\) TO service_role/i);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.expire_stale_challenges\(\) TO authenticated/i);
});

// --- Phone UI ---------------------------------------------------------------

test('the modal shows whose turn it is rather than making the player work it out', () => {
  assert.match(challengesPage, /const theirProposal = proposal && proposal\.proposed_by_player_id !== myPlayerId \? proposal : null;/);
  assert.match(challengesPage, /const myProposal\s+= proposal && proposal\.proposed_by_player_id === myPlayerId \? proposal : null;/);
  assert.match(challengesPage, /Waiting for their reply…/);
  assert.match(challengesPage, /You suggested this\. They can accept it or suggest another\./);
});

test('the reply is two taps: that works, or suggest another', () => {
  assert.match(challengesPage, /That works ✓/);
  assert.match(challengesPage, /Suggest a different time/);
  assert.match(challengesPage, /action: 'accept_proposal'/);
  assert.match(challengesPage, /action: 'propose'/);
});

test('NO page anywhere still locks a time in with the one-shot accept', () => {
  // NotificationsPage carries its own inline respond flow. Scoping this check
  // to ChallengesPage alone is exactly how that one got missed: the challenged
  // player could answer from their notifications and skip the negotiation
  // entirely, and because 'accept' is aliased to 'propose' it would have
  // silently created a proposal while the UI claimed the match was scheduled.
  for (const [name, source] of Object.entries({ challengesPage, notificationsPage })) {
    assert.doesNotMatch(source, /action: 'accept'(?!_)/, `${name} still uses the one-shot accept`);
  }
  assert.match(notificationsPage, /action: 'propose'/);
  assert.match(notificationsPage, /Nothing is locked in until one of you agrees\./);
});

test('the notifications respond flow surfaces errors and clears its loading state', () => {
  assert.match(notificationsPage, /if \(!res\.ok && !json\.error\) return \{ error: 'Something went wrong\. Please try again\.' \};/);
  for (const fn of ['handlePropose', 'handleDecline']) {
    const body = notificationsPage.match(new RegExp(`const ${fn} = async[\\s\\S]*?\\n {2}\\};`));
    assert.ok(body, `expected ${fn}`);
    assert.match(body[0], /finally \{\s*\n\s*setLoading\(false\);/, `${fn} must clear loading in a finally`);
  }
});

test('a challenge still being scheduled is visible to both players', () => {
  assert.match(challengesPage, /\['pending', 'accepted'\]\.includes\(c\.status\)/);
  assert.match(challengesPage, /Pick a time/);
});

test('the wash escape is still offered during negotiation', () => {
  // README: "If you can't agree on a time: the challenge is a wash."
  assert.match(challengesPage, /We couldn't agree on a time/);
});

test('the modal surfaces server errors and never leaves the button dead', () => {
  assert.match(challengesPage, /const json = await res\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
  assert.match(challengesPage, /if \(!res\.ok && !json\.error\) return \{ error: 'Something went wrong\. Please try again\.' \};/);
  assert.match(challengesPage, /Connection problem — nothing was sent\./);
  const proposeFn = challengesPage.match(/const handlePropose = async[\s\S]*?\n {2}\};/);
  assert.ok(proposeFn && /finally \{\s*\n\s*setLoading\(false\);/.test(proposeFn[0]), 'handlePropose must clear loading in a finally');
});

test('the proposal query is not refetched on every render', () => {
  assert.match(challengesPage, /const challenges = useMemo\(\(\) => challengesData \?\? \[\], \[challengesData\]\);/);
  assert.match(challengesPage, /const negotiatingIds = useMemo\(/);
});

// --- Types and CI -----------------------------------------------------------

test('the generated types describe the proposal row', () => {
  assert.match(databaseTypes, /challenge_proposals: \{/);
  assert.match(databaseTypes, /status: 'pending' \| 'accepted' \| 'superseded';/);
  assert.match(databaseTypes, /export type ChallengeProposal = /);
});

test('the negotiation invariants are proven at runtime, not just asserted in source', () => {
  assert.match(sqlAssert, /two pending proposals were allowed on one challenge/);
  assert.match(sqlAssert, /EXCEPTION WHEN unique_violation THEN NULL/);
  assert.match(sqlAssert, /a negotiating challenge past its deadline was not expired/);
  assert.match(sqlAssert, /players can write proposals directly, bypassing turn order/);
  // And CI runs it.
  assert.match(workflow, /02_negotiation_assert\.sql/);
});

test('nothing added in this package reintroduces mojibake or a BOM', () => {
  for (const [name, source] of Object.entries({ migration, respondToChallenge, challengesPage, sqlAssert })) {
    assert.doesNotMatch(source, /Ã.|â€|ðŸ/, `${name} contains mojibake`);
    assert.ok(!source.startsWith('﻿'), `${name} starts with a BOM`);
  }
});
