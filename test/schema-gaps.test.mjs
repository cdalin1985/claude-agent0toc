// Executes src/lib/schemaGaps.ts rather than grepping it. The sibling
// test/schema-tolerance.test.mjs asserts that SettingsPage *calls*
// onlyExistingColumns; it cannot say anything about what the function returns,
// which is where the data-loss bug lived.

import test from 'node:test';
import assert from 'node:assert/strict';

import { onlyExistingColumns } from '../src/lib/schemaGaps.ts';

// The real Save Profile payload, with every field at its "user left it blank"
// value -- which is what the form produces before the player row has loaded.
const PROFILE_PAYLOAD = {
  bio: null,
  preferred_discipline: null,
  nickname: null,
  tagline: null,
  home_venue: null,
  years_playing: null,
  cue_brand: null,
};

test('a null reference writes nothing rather than writing everything', () => {
  // The regression: `if (!reference) return payload` sent all seven columns as
  // null when the initial read had failed or not yet resolved, wiping the
  // player's profile in one tap and reporting success.
  assert.deepEqual(onlyExistingColumns(PROFILE_PAYLOAD, null), {});
  assert.deepEqual(onlyExistingColumns(PROFILE_PAYLOAD, undefined), {});
});

test('a loaded row still narrows to the columns it actually has', () => {
  // The deploy-skew case this helper exists for: the frontend knows about
  // columns the database has not been migrated to yet.
  const preMigrationRow = { id: 'x', bio: 'hi', preferred_discipline: '8 Ball' };
  assert.deepEqual(
    onlyExistingColumns(PROFILE_PAYLOAD, preMigrationRow),
    { bio: null, preferred_discipline: null },
  );
});

test('a fully migrated row passes every column through', () => {
  const fullRow = Object.fromEntries(Object.keys(PROFILE_PAYLOAD).map((k) => [k, 'seeded']));
  assert.deepEqual(onlyExistingColumns(PROFILE_PAYLOAD, fullRow), PROFILE_PAYLOAD);
});

test('an empty reference row is treated as "no columns", not "all columns"', () => {
  // `{}` is a real row that happens to have no matching keys. It must narrow to
  // nothing -- and critically must not be confused with the null case above.
  assert.deepEqual(onlyExistingColumns(PROFILE_PAYLOAD, {}), {});
});

test('values are preserved exactly, including falsy ones', () => {
  // years_playing: 0 is meaningful ("rookie"), and must not be dropped as falsy.
  const payload = { years_playing: 0, nickname: '', bio: false };
  const reference = { years_playing: 5, nickname: 'x', bio: 'y' };
  assert.deepEqual(onlyExistingColumns(payload, reference), payload);
});
