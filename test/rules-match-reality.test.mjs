// The Rules screen is the league's contract with its members. Every claim on it
// has to be true of the running system.
//
// Three of these have already been found false the hard way: privacy toggles
// that did not filter, a treasury described as "visible to every member" that
// was readable by nobody, and "a challenge expires if not answered within 2
// days" when nothing ever expired one. Each looked fine in review and only
// showed up when someone checked the claim against the code.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const rules = read('src/pages/RulesPage.tsx');
const matchPage = read('src/pages/MatchPage.tsx');
const updateScore = read('supabase/functions/update-match-score/index.ts');
const submitResult = read('supabase/functions/submit-result/index.ts');

test('the scorekeeper rule describes who actually gets the scoreboard', () => {
  // update-match-score awards the scoreboard to whoever claims
  // initiated_by_player_id first -- either participant, not the challenger.
  // MatchPage says the same thing ("whoever taps Start Match first"). The Rules
  // screen used to say "The challenger keeps the live score", so a challenger
  // whose opponent tapped Start first was locked out by a rule that told them
  // the scoreboard was theirs.
  assert.match(updateScore, /initiated_by_player_id/);
  assert.match(updateScore, /Only the match initiator can update the score/);
  assert.match(matchPage, /whoever taps "Start Match" first becomes the scorekeeper/);

  assert.doesNotMatch(rules, /challenger keeps the live score/i);
  assert.match(rules, /Start Match/);
});

test('the scoreboard is claimed atomically, as the rule implies', () => {
  // "One scoreboard, no double entry" is only true if the claim is race-safe.
  assert.match(updateScore, /\.is\('initiated_by_player_id', null\)/);
});

test('the $5 match fee on the Rules screen is the amount actually ledgered', () => {
  assert.match(rules, /\$5 match fee/);
  assert.match(submitResult, /const MATCH_FEE_CENTS = 500;/);
  // The ledger row must use the constant. It previously hardcoded 500 in
  // amount_cents while metadata used MATCH_FEE_CENTS, so changing the fee would
  // have disagreed with itself inside a single row of the table the league
  // audits for transparency.
  assert.match(submitResult, /amount_cents: MATCH_FEE_CENTS,/);
  assert.doesNotMatch(submitResult, /amount_cents: 500,/);
});

test('each player is billed once per match, not once per match total', () => {
  // Both players owe the fee, so the idempotency key has to include player_id.
  // Keyed on (source_type, source_id) alone, the second player's fee would be
  // swallowed as a duplicate and the treasury would be short $5 every match.
  assert.match(submitResult, /source_type: 'match_fee'/);
  assert.match(submitResult, /player_id: payer\.player_id/);
  assert.match(submitResult, /!== '23505'/);
});

test('the treasury is described as visible to members, and is', () => {
  assert.match(rules, /visible to every member/);
  // Delivered by the two security_invoker=false views, not by opening the
  // table. 05_treasury_visibility_assert.sql and 08_production_alignment_assert
  // pin both halves at runtime.
  const treasuryMigration = read('supabase/migrations/20260807170000_treasury_visible_to_members.sql');
  assert.match(treasuryMigration, /GRANT SELECT ON public\.treasury_summary\s+TO authenticated;/);
});

test('challenge expiry is described as automatic, and is scheduled', () => {
  assert.match(rules, /A challenge expires if not answered/);
  const expiryMigration = read('supabase/migrations/20260817095214_expire_challenges_on_a_schedule.sql');
  assert.match(expiryMigration, /'challenge-expiry-check'/);
});
