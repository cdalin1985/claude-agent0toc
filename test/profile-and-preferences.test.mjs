import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const migration = read('supabase', 'migrations', '20260807150000_venue_stats_profile_and_preferences.sql');
const submitResult = read('supabase', 'functions', 'submit-result', 'index.ts');
const sharedPush = read('supabase', 'functions', '_shared', 'sendPush.ts');
const createChallenge = read('supabase', 'functions', 'create-challenge', 'index.ts');
const playerPage = read('src', 'pages', 'PlayerPage.tsx');
const settingsPage = read('src', 'pages', 'SettingsPage.tsx');
const settingsHook = read('src', 'hooks', 'useLeagueSettings.ts');
const databaseTypes = read('src', 'types', 'database.ts');
const sqlAssert = read('supabase', 'tests', 'migrations', '03_preferences_assert.sql');

// --- Enforcement lives in one place ----------------------------------------

test('preferences are enforced by a trigger, not by each send site remembering', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.apply_notification_preferences\(\)/i);
  assert.match(migration, /BEFORE INSERT ON public\.notifications/i);
  // Returning NULL in a BEFORE INSERT is what drops the row.
  assert.match(migration, /RETURN NULL;/);
});

test('push and the in-app trigger ask the same question', () => {
  // Otherwise a muted category could be silent in the app and still buzz a phone.
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.player_accepts_notification\(p_player_id UUID, p_type TEXT\)/i);
  for (const [name, source] of Object.entries({ sharedPush, createChallenge, submitResult })) {
    assert.match(source, /player_accepts_notification/, `${name} does not consult the shared preference check`);
    assert.match(source, /push_enabled/, `${name} does not honour the master push switch`);
  }
});

test('every failure mode defaults to delivering, never to silence', () => {
  // Missing configuration or a transient error must not mute a player.
  assert.match(migration, /IF v_category IS NULL THEN\s*\n\s*RETURN TRUE;/i);
  assert.match(migration, /IF NOT FOUND THEN\s*\n\s*RETURN TRUE;/i);
  assert.match(sharedPush, /sending anyway/);
  const wants = sharedPush.match(/async function playerWantsPush[\s\S]*?\n\}/);
  assert.ok(wants, 'expected playerWantsPush');
  // Both error branches send anyway...
  assert.match(wants[0], /if \(prefsError\) \{[\s\S]*?return true;/);
  assert.match(wants[0], /if \(acceptsError\) \{[\s\S]*?return true;/);
  // ...and the ONLY two ways to be skipped are the player's own explicit
  // choices: the master switch, and the category.
  assert.equal((wants[0].match(/return false;/g) ?? []).length, 2);
  assert.match(wants[0], /prefs\.push_enabled === false/);
  assert.match(wants[0], /accepts === false/);
});

test('consequences cannot be muted', () => {
  // Forfeits, disputes, rank-1 penalties, treasury and admin actions map to no
  // category, so notification_category returns NULL and they always deliver.
  const fn = migration.match(/CREATE OR REPLACE FUNCTION public\.notification_category[\s\S]*?\$\$;/i);
  assert.ok(fn, 'expected notification_category');
  for (const muteable of ['rank1_penalty', 'result_disputed', 'match_disputed', 'dispute_resolved', 'challenge_forfeited', 'treasury']) {
    assert.doesNotMatch(fn[0], new RegExp(`'${muteable}'`), `${muteable} must not be switchable off`);
  }
  assert.match(fn[0], /ELSE NULL/i);
});

test('the runtime suite proves the toggles bite rather than just storing a flag', () => {
  assert.match(sqlAssert, /turning challenges off did not stop a challenge notification/);
  assert.match(sqlAssert, /turning challenges off also muted reminders/);
  assert.match(sqlAssert, /a rank-1 penalty was suppressed by a preference/);
  assert.match(sqlAssert, /an unmapped notification type defaulted to silence/);
  assert.match(sqlAssert, /a player with no preferences row was silenced/);
});

// --- Preference rows exist for everyone -------------------------------------

test('every player gets a preferences row without anyone remembering', () => {
  assert.match(migration, /INSERT INTO public\.player_preferences \(player_id\)\s*\n\s*SELECT id FROM public\.players/i);
  assert.match(migration, /CREATE TRIGGER trg_ensure_player_preferences\s*\n\s*AFTER INSERT ON public\.players/i);
  // Players may change their own settings but never create or destroy the row.
  assert.match(migration, /REVOKE INSERT, DELETE ON public\.player_preferences FROM anon, authenticated/i);
});

// --- Venue stats -------------------------------------------------------------

test('venue stats mirror discipline stats instead of inventing a second shape', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.player_venue_stats/i);
  for (const col of ['matches_played', 'wins', 'losses', 'current_streak', 'best_streak', 'challenger_wins', 'defender_wins', 'total_race_length']) {
    assert.match(migration, new RegExp(`\\b${col}\\b`), `venue stats missing ${col}`);
  }
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_player_venue_stats_unique/i);
});

test('venue is not constrained, so adding a venue is not a migration', () => {
  assert.doesNotMatch(migration, /venue\s+TEXT NOT NULL CHECK/i);
  assert.doesNotMatch(migration, /'Eagles 4040'/);
  assert.doesNotMatch(migration, /'Valley Hub'/);
});

test('the backfill computes streaks in completion order, not row order', () => {
  assert.match(migration, /ROW_NUMBER\(\) OVER \(PARTITION BY player_id, venue ORDER BY completed_at NULLS LAST\)/i);
  assert.match(migration, /ON CONFLICT \(player_id, venue\) DO NOTHING/i);
});

test('both stats tables are maintained by one implementation', () => {
  // Two near-identical blocks drift the first time someone fixes a streak bug
  // in only one of them.
  assert.match(submitResult, /async function updateSplitStats\(/);
  assert.match(submitResult, /updateSplitStats\(supabase, 'player_discipline_stats', 'discipline', match\.discipline, participants, match\.race_length\)/);
  assert.match(submitResult, /updateSplitStats\(supabase, 'player_venue_stats', 'venue', match\.venue, participants, match\.race_length\)/);
  // A null venue must not create a stats bucket named "null".
  assert.match(submitResult, /if \(match\.venue\) \{/);
});

test('players cannot write their own stats', () => {
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.player_venue_stats FROM anon, authenticated/i);
  assert.match(migration, /GRANT SELECT ON public\.player_venue_stats TO anon, authenticated/i);
});

// --- Profile customization ---------------------------------------------------

test('new profile columns are bounded so one player cannot wreck the roster', () => {
  assert.match(migration, /char_length\(nickname\)\s+<= 24/i);
  assert.match(migration, /char_length\(tagline\)\s+<= 80/i);
  assert.match(migration, /accent_color ~ '\^#\[0-9A-Fa-f\]\{6\}\$'/);
  assert.match(migration, /years_playing >= 0 AND years_playing <= 90/i);
});

test('only cosmetic columns become self-editable', () => {
  // players carries a column-level UPDATE allowlist for `authenticated`, so a
  // new column stays closed until named. Nothing privileged may be named.
  const grant = migration.match(/GRANT UPDATE \(([^)]*)\)\s*\n?\s*ON public\.players TO authenticated/i);
  assert.ok(grant, 'expected a column-level UPDATE grant on players');
  for (const forbidden of ['role', 'is_active', 'profile_id', 'full_name']) {
    assert.doesNotMatch(grant[1], new RegExp(`\\b${forbidden}\\b`), `${forbidden} must not be self-editable`);
  }
  assert.match(grant[1], /nickname/);
});

// --- The screens a player actually touches ----------------------------------

test('venue stats are visible on a profile, with tabs from settings', () => {
  assert.match(playerPage, /By Venue/);
  assert.match(playerPage, /from\('player_venue_stats'\)/);
  assert.match(playerPage, /venuesFrom\(leagueSettings\)/);
  // A venue removed from settings still shows if this player has a record
  // there — hiding it would silently delete history.
  assert.match(playerPage, /played\.filter\(\(v\) => !configured\.includes\(v\)\)/);
});

test('the venue list is never hardcoded on the client', () => {
  assert.match(settingsHook, /export function venuesFrom/);
  for (const [name, source] of Object.entries({ playerPage, settingsPage })) {
    assert.doesNotMatch(source, /'Eagles 4040'/, `${name} hardcodes a venue`);
    assert.doesNotMatch(source, /'Valley Hub'/, `${name} hardcodes a venue`);
  }
});

test('a player who hides their stats still sees their own', () => {
  // Otherwise the toggle looks broken from the inside.
  assert.match(playerPage, /const isSelf\s+= myPlayer\?\.id === id;/);
  assert.match(playerPage, /\{\(showStats \|\| isSelf\) && \(<>/);
  assert.match(playerPage, /Only you can see these/);
  assert.match(playerPage, /keeps their detailed stats private\./);
});

test('a missing preferences row shows the profile rather than blanking it', () => {
  assert.match(playerPage, /const showDetails = prefs\?\.show_profile_details \?\? true;/);
  assert.match(playerPage, /const showStats\s+= prefs\?\.show_stats_publicly \?\? true;/);
});

test('every toggle is reachable, labelled, and reverts visibly on failure', () => {
  for (const key of ['notify_challenges', 'notify_reminders', 'notify_results', 'notify_activity', 'push_enabled', 'show_stats_publicly', 'show_profile_details']) {
    assert.match(settingsPage, new RegExp(`setPreference\\('${key}'`), `${key} has no control`);
  }
  // Optimistic, then rolled back with a reason — a switch that silently springs
  // back is the worst version of this.
  assert.match(settingsPage, /const previous = prefs;/);
  assert.match(settingsPage, /setPrefs\(previous\);/);
  assert.match(settingsPage, /Couldn't save that setting/);
  assert.match(settingsPage, /role="switch"/);
  assert.match(settingsPage, /aria-checked=\{checked\}/);
});

test('the settings screen tells the player what cannot be switched off', () => {
  assert.match(settingsPage, /Forfeits, disputes and anything affecting your rank or the treasury always come through\./);
  assert.match(settingsPage, /stay on the ladder either way/);
});

test('saving a profile reports failure instead of pretending it worked', () => {
  assert.match(settingsPage, /Couldn't save your profile/);
  assert.match(settingsPage, /Years playing must be a whole number between 0 and 90\./);
  assert.match(settingsPage, /Pick a colour from the swatches/);
});

test('the accent colour cannot be set to an invalid value from the UI', () => {
  // Swatches rather than a text field: always valid, and one tap on a phone.
  assert.match(settingsPage, /const ACCENT_SWATCHES = \[/);
  assert.doesNotMatch(settingsPage, /type="color"/);
});

test('the toggle row is one component rather than eight copies', () => {
  assert.match(settingsPage, /function ToggleRow\(/);
  assert.ok((settingsPage.match(/<ToggleRow/g) ?? []).length >= 7);
});

// --- Types and encoding ------------------------------------------------------

test('the generated types describe the new tables and columns', () => {
  assert.match(databaseTypes, /player_venue_stats: \{/);
  assert.match(databaseTypes, /player_preferences: \{/);
  assert.match(databaseTypes, /nickname: string \| null;/);
  assert.match(databaseTypes, /accent_color: string \| null;/);
  // Preference rows are trigger-created, so the client must never insert one.
  assert.match(databaseTypes, /Insert: never;/);
});

test('nothing added in this package reintroduces mojibake or a BOM', () => {
  for (const [name, source] of Object.entries({ migration, submitResult, sharedPush, playerPage, settingsPage, settingsHook, sqlAssert })) {
    assert.doesNotMatch(source, /Ã.|â€|ðŸ/, `${name} contains mojibake`);
    assert.ok(!source.startsWith('﻿'), `${name} starts with a BOM`);
  }
});
