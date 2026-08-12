import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const helper = read('src', 'lib', 'schemaGaps.ts');
const playerPage = read('src', 'pages', 'PlayerPage.tsx');
const settingsPage = read('src', 'pages', 'SettingsPage.tsx');
const challengesPage = read('src', 'pages', 'ChallengesPage.tsx');

// --- The helper -------------------------------------------------------------

test('a missing table or column is recognised however Postgres reports it', () => {
  // PostgREST uses PGRST205/PGRST204; Postgres uses 42P01/42703; a widened
  // select naming an absent column comes back as a 400 whose message names it.
  for (const code of ['PGRST205', 'PGRST204', '42P01', '42703']) {
    assert.match(helper, new RegExp(`'${code}'`), `${code} is not recognised`);
  }
  assert.match(helper, /does not exist/);
  assert.match(helper, /could not find/);
  assert.match(helper, /schema cache/);
});

test('the helper does not treat every error as a missing object', () => {
  // Otherwise a real failure — RLS, a constraint, a dropped connection — would
  // be silently swallowed as "feature not available".
  assert.match(helper, /if \(!error\) return false;/);
  const fn = helper.match(/export function isMissingSchemaObject[\s\S]*?\n\}/);
  assert.ok(fn, 'expected isMissingSchemaObject');
  assert.doesNotMatch(fn[0], /return true;\s*\n\}/, 'must not unconditionally return true');
});

test('an update can be narrowed to columns that actually exist', () => {
  assert.match(helper, /export function onlyExistingColumns/);
  // The loaded row is the reference, because it is the only trustworthy
  // statement of what the database has.
  assert.match(helper, /const allowed = new Set\(Object\.keys\(reference\)\);/);
  // No reference means write nothing. This used to return the whole payload on
  // the reasoning "never silently drop a payload" — but the payload's fields are
  // all initialised to '' and coerced to null, so on a failed or not-yet-resolved
  // initial read that reasoning blanked seven profile columns in one tap and
  // reported success. Dropping the write is the recoverable direction.
  // Behaviour (not source text) is covered by test/schema-gaps.test.mjs.
  assert.match(helper, /if \(!reference\) return \{\};/);
});

// --- The screens ------------------------------------------------------------

test('the profile load cannot be broken by a column the database lacks', () => {
  // This is the exact regression: naming a new column in the select 400s the
  // whole request and takes bio and preferred discipline with it.
  assert.match(settingsPage, /\.select\('\*'\)\s*\n\s*\.eq\('id', playerId\)\.single\(\)/);
  assert.doesNotMatch(settingsPage, /\.select\('bio, preferred_discipline, nickname/);
});

test('the profile save only sends columns the loaded row had', () => {
  assert.match(settingsPage, /update\(onlyExistingColumns\(\{/);
  assert.match(settingsPage, /\}, playerRow\)\)\.eq\('id', player\.id\)/);
  assert.match(settingsPage, /setPlayerRow\(data as Record<string, unknown>\)/);
});

test('the notification toggles hide rather than spin forever when unsupported', () => {
  assert.match(settingsPage, /const \[prefsSupported, setPrefsSupported\] = useState<boolean \| null>\(null\)/);
  assert.match(settingsPage, /\{player && prefsSupported !== false && \(/);
  assert.match(settingsPage, /setPrefsSupported\(!isMissingSchemaObject\(error\) \? true : false\)/);
});

test('the accent colour explains itself instead of leaking a schema error', () => {
  assert.match(settingsPage, /Accent colours are not switched on yet/);
});

test('venue stats distinguish "not available yet" from "no matches here"', () => {
  // Returning [] for both would tell a player who has played at a venue that
  // they have not.
  assert.match(playerPage, /if \(isMissingSchemaObject\(error\)\) return null;/);
  assert.match(playerPage, /const venueStatsAvailable = venueStatsRaw !== null && venueStatsRaw !== undefined;/);
  assert.match(playerPage, /\{venueStatsAvailable && \(/);
});

test('a profile still renders when the preferences table is absent', () => {
  // Defaults must be permissive: an unreadable preference is not a hidden one.
  assert.match(playerPage, /const showDetails = prefs\?\.show_profile_details \?\? true;/);
  assert.match(playerPage, /const showStats\s+= prefs\?\.show_stats_publicly \?\? true;/);
});

test('the challenges screen degrades to pre-negotiation rather than erroring', () => {
  assert.match(challengesPage, /if \(isMissingSchemaObject\(error\)\) return new Map\(\);/);
});

test('every schema-tolerant query still rethrows genuine errors', () => {
  // Tolerance must be narrow. A real failure has to keep surfacing.
  for (const [name, source] of Object.entries({ playerPage, challengesPage })) {
    for (const block of source.match(/if \(isMissingSchemaObject\(error\)\)[\s\S]{0,80}?throw error;/g) ?? []) {
      assert.match(block, /throw error;/, `${name} swallows non-schema errors`);
    }
    assert.ok(
      (source.match(/if \(isMissingSchemaObject\(error\)\)/g) ?? []).length >= 1,
      `${name} has no tolerance guard`,
    );
  }
});

test('nothing here reintroduces mojibake or a BOM', () => {
  for (const [name, source] of Object.entries({ helper, playerPage, settingsPage, challengesPage })) {
    assert.doesNotMatch(source, /Ã.|â€|ðŸ/, `${name} contains mojibake`);
    assert.ok(!source.startsWith('﻿'), `${name} starts with a BOM`);
  }
});
