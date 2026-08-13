// What a member is shown when something fails.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const { humanError, failureMessage } = await import('../src/lib/humanError.ts');
const read = (path) => readFileSync(join(process.cwd(), path), 'utf8');

test('a message that says something is left alone', () => {
  // Supabase's auth errors are better than any generic sentence. Replacing
  // them would be its own kind of lying — a member who has hit the rate limit
  // needs to be told that, not "check your connection".
  assert.equal(humanError('Email rate limit exceeded', 'fallback'), 'Email rate limit exceeded');
  assert.equal(humanError('Banner must be under 5 MB.', 'fallback'), 'Banner must be under 5 MB.');
});

test('every browser dialect of "the request never arrived" is replaced', () => {
  // Chrome, Safari, Firefox and undici each word this differently, and a member
  // reading any of them after "Couldn't save your profile:" concludes the
  // profile was rejected.
  for (const raw of [
    'Failed to fetch',
    'Load failed',
    'NetworkError when attempting to fetch resource.',
    'Network request failed',
    'fetch failed',
    'net::ERR_INTERNET_DISCONNECTED',
    'The operation timed out',
    'The user aborted a request.',
  ]) {
    assert.equal(humanError(raw, 'fallback'), 'fallback', `${raw} reached the member`);
  }
});

test('Postgres internals never reach a member', () => {
  for (const raw of [
    'duplicate key value violates unique constraint "idx_challenges_one_active_per_challenger"',
    'new row violates row-level security policy for table "objects"',
    'new row for relation "players" violates check constraint "players_profile_text_bounds"',
    'permission denied for table players',
    'column "home_venue" does not exist',
    'JWT expired',
  ]) {
    assert.equal(humanError(raw, 'fallback'), 'fallback', `leaked: ${raw}`);
  }
});

test('an empty or missing message falls back', () => {
  assert.equal(humanError(undefined, 'fallback'), 'fallback');
  assert.equal(humanError(null, 'fallback'), 'fallback');
  assert.equal(humanError('   ', 'fallback'), 'fallback');
});

test('failureMessage only prefixes when the prefix adds to something', () => {
  assert.equal(
    failureMessage('Could not save that colour', 'Invalid hex value'),
    'Could not save that colour: Invalid hex value',
  );
  // The bug this exists to prevent: "Couldn't save your profile: Failed to fetch".
  const dropped = failureMessage("Couldn't save your profile", 'Failed to fetch');
  assert.doesNotMatch(dropped, /Failed to fetch/);
  assert.match(dropped, /Couldn't save your profile/);
  assert.match(dropped, /connection/);
});

test('no raw error message is rendered without passing through the filter', () => {
  // A bare `${err.message}` in a setState is how all of these got shown in the
  // first place. Catching a reintroduction is worth more than the regex is ugly.
  for (const page of ['src/pages/SettingsPage.tsx', 'src/pages/AdminPage.tsx', 'src/pages/LoginPage.tsx']) {
    const source = read(page);
    const bare = source
      .split('\n')
      .filter((line) => /set\w*Error\((?:`[^`]*\$\{)?\w+\.message/.test(line))
      .filter((line) => !/humanError|failureMessage/.test(line))
      .filter((line) => !line.trim().startsWith('//'));
    assert.deepEqual(bare, [], `${page} shows a raw error message`);
  }
});
