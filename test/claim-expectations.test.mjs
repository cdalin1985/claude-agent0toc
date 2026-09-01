// What a member is told when the name they came for is gone.
//
// Names are not reserved: whoever claims first gets it, with admin
// notification and one-tap Release claim as the accepted safety net. That is a
// deliberate league decision. What was NOT deliberate is that the screen never
// said so, and actively misdirected anyone who arrived too late.
//
// The list renders only unclaimed players, so a member searching for a name
// somebody else had taken matched nothing and was told "Don't see your name?
// Ask a league admin to add you" -- telling someone already on the ladder that
// they are not on it, at the moment they are most likely to panic.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const claim = readFileSync(join(process.cwd(), 'src/pages/ClaimPage.tsx'), 'utf8');

test('the screen says names are not reserved, before anyone chooses', () => {
  // Being surprised is a function of expectation, not of mechanism. The
  // mechanism is settled; the expectation was never set.
  assert.match(claim, /Names aren&rsquo;t held for anyone/);
  assert.match(claim, /whoever claims first gets it/);
  // And that it is recoverable, so the warning does not just alarm.
  assert.match(claim, /a league admin can hand it back/);
});

test('it knows which names are already taken', () => {
  // The visible list is unclaimed-only, so claimed names have to be fetched
  // separately or "taken" and "absent" are indistinguishable.
  assert.match(claim, /\.not\('profile_id', 'is', null\)/);
  assert.match(claim, /claimedNames/);
});

test('a taken name is reported as taken, not as missing', () => {
  assert.match(claim, /searchMatchesClaimedName/);
  assert.match(claim, /has already been claimed/);
  assert.match(claim, /they can release it back to you/);
});

test('the taken-name message needs a search term', () => {
  // With an empty box every claimed name substring-matches, and the roster
  // would announce itself as closed to someone who had typed nothing.
  assert.match(claim, /search\.trim\(\)\.length > 0 &&/);
});

test('the three empty states stay distinct', () => {
  // taken / everyone claimed / not on the roster each need different action.
  assert.match(claim, /All players have been claimed\./);
  assert.match(claim, /Ask a league admin to add you\./);
  // The render site, not the declaration above it.
  const at = claim.indexOf('{searchMatchesClaimedName');
  const emptyBlock = claim.slice(at, at + 700);
  assert.match(emptyBlock, /has already been claimed/);
});

test('claiming is still a deliberate, reversible-by-admin act', () => {
  // The safety net the league actually chose.
  assert.match(claim, /Are you \{selected\.player\.full_name\}\?/);
  assert.match(claim, /You can't undo this without contacting the admin\./);
});
