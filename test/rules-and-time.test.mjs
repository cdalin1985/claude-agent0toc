import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const migration = read('supabase', 'migrations', '20260807120000_enforce_match_window_and_reminders.sql');
const submitResult = read('supabase', 'functions', 'submit-result', 'index.ts');
const createChallenge = read('supabase', 'functions', 'create-challenge', 'index.ts');
const respondToChallenge = read('supabase', 'functions', 'respond-to-challenge', 'index.ts');
const databaseTypes = read('src', 'types', 'database.ts');

// --- README rule: a winner who climbs also cools down -----------------------

test('a win that moves the winner up the list creates a cooldown for them too', () => {
  // README: "If you win (lower seed beats higher seed): ... You must wait 24
  // hours before challenging up again."
  assert.match(submitResult, /async function createPostMatchCooldowns\(/);
  assert.match(submitResult, /climberId: string \| null/);
  assert.match(submitResult, /if \(climberId\) rows\.push\(\{ player_id: climberId, type: 'post_match', expires_at: expiresAt \}\)/);
  // The old loser-only helper must be gone, not merely unused.
  assert.doesNotMatch(submitResult, /createPostLossCooldown/);
});

test('the climber cooldown is keyed off an actual ranking change, not merely winning', () => {
  // README: "If you defend your spot (higher seed wins): You can challenge up
  // immediately". rankChange is non-null only when the cascade ran, so a
  // successful defence passes null and gets no cooldown.
  assert.match(submitResult, /createPostMatchCooldowns\(supabase, loserId, rankChange \? winnerId : null\)/);
});

test('cooldown length still comes from league_settings rather than a literal', () => {
  assert.match(submitResult, /\.from\('league_settings'\)\.select\('cooldown_hours'\)/);
  assert.match(submitResult, /const cooldownHours = settings\?\.cooldown_hours \?\? 24;/);
  assert.match(submitResult, /if \(cooldownHours <= 0\) return;/);
});

test('the cooldown settings read reports failure instead of silently defaulting', () => {
  assert.match(submitResult, /if \(settingsError\) console\.error\(/);
});

// --- README rule: a wash costs nothing --------------------------------------

test('washed and overdue challenges do not consume a weekly challenge', () => {
  // README: "If you can't agree on a time: The challenge is a wash. No
  // penalties for either player."
  assert.match(createChallenge, /function countsAgainstWeeklyLimit\(/);
  assert.match(createChallenge, /if \(row\.status === 'expired'\) return false;/);
  assert.match(
    createChallenge,
    /if \(row\.status === 'cancelled' && \(row\.cancel_reason === 'wash' \|\| row\.cancel_reason === 'overdue'\)\) return false;/,
  );
});

test('a challenge the challenger withdrew still consumes a weekly challenge', () => {
  // Otherwise the limit is unenforceable: create, withdraw, repeat.
  assert.doesNotMatch(createChallenge, /cancel_reason === 'withdrawn'/);
  // Anything not explicitly excused counts: the predicate's final statement.
  assert.match(createChallenge, /return true;\r?\n\}/);
});

test('the weekly limit counts filtered rows and surfaces a failed count', () => {
  assert.match(createChallenge, /\.select\('status, cancel_reason'\)/);
  assert.match(createChallenge, /const weeklyCount = \(recentChallenges \?\? \[\]\)\.filter\(countsAgainstWeeklyLimit\)\.length;/);
  assert.match(createChallenge, /if \(weeklyError\) \{/);
  assert.match(createChallenge, /status: 500/);
  // The old unfiltered count must not survive alongside the new one.
  assert.doesNotMatch(createChallenge, /count: 'exact', head: true \}\)\.eq\('challenger_id', challenger\.id\)\.gte\('created_at', sevenDaysAgo\)/);
});

test('respond-to-challenge records why a challenge was cancelled', () => {
  // A wash of a still-pending challenge is a withdrawal: there was never a time
  // to fail to agree on.
  assert.match(respondToChallenge, /const cancelReason = challenge\.status === 'pending' \? 'withdrawn' : 'wash';/);
  assert.match(respondToChallenge, /\.update\(\{ status: 'cancelled', cancel_reason: cancelReason \}\)/);
  assert.match(respondToChallenge, /\.update\(\{ status: 'cancelled', cancel_reason: 'withdrawn' \}\)/);
});

test('the wash and withdraw writes are guarded by their prior status', () => {
  assert.match(respondToChallenge, /\.in\('status', \['pending', 'accepted', 'scheduled'\]\);/);
  assert.match(respondToChallenge, /\.update\(\{ status: 'cancelled', cancel_reason: 'withdrawn' \}\)\s*\n\s*\.eq\('id', challenge_id\)\s*\n\s*\.eq\('status', 'pending'\)/);
});

test('washing a challenge tells the other player', () => {
  assert.match(respondToChallenge, /const otherPlayerId = isChallenger \? challenge\.challenged_id : challenge\.challenger_id;/);
  assert.match(respondToChallenge, /type: 'challenge_expired',/);
  assert.match(respondToChallenge, /await sendPush\(supabase, otherPlayerId,/);
});

test('every cancel-path write checks its error', () => {
  for (const name of ['cancelError', 'matchCancelError', 'washActivityError', 'washNotifyError', 'withdrawError', 'cancelActivityError']) {
    assert.match(respondToChallenge, new RegExp(`if \\(${name}\\) throw ${name};`));
  }
});

// --- README rule: the 10-day play window ------------------------------------

test('the play window comes from league_settings, not a hardcoded 10', () => {
  assert.match(respondToChallenge, /\.select\('venues, match_play_days'\)/);
  assert.match(respondToChallenge, /const matchPlayDays = settings\?\.match_play_days \?\? 10;/);
  assert.doesNotMatch(respondToChallenge, /Date\.now\(\) \+ 10 \* 24 \* 3600 \* 1000/);
});

test('the migration adds the settings and columns the enforcement reads', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS match_play_days INTEGER NOT NULL DEFAULT 10/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS match_reminder_hours INTEGER NOT NULL DEFAULT 24/i);
  assert.match(migration, /ALTER TABLE public\.challenges\s+ADD COLUMN IF NOT EXISTS cancel_reason TEXT/i);
  assert.match(migration, /ALTER TABLE public\.matches\s+ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ/i);
  assert.match(migration, /CHECK \(cancel_reason IS NULL OR cancel_reason IN \('wash', 'withdrawn', 'overdue'\)\)/i);
});

test('an overdue match is ruled a wash only when it never got under way', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.expire_overdue_matches\(\)/i);
  assert.match(migration, /c\.match_deadline < NOW\(\)/i);
  assert.match(migration, /cancel_reason = 'overdue'/i);
  // A match that reached in_progress/submitted/confirming was played; cancelling
  // it would destroy a real result.
  assert.match(migration, /AND NOT EXISTS \(\s*SELECT 1 FROM public\.matches m\s*WHERE m\.challenge_id = c\.id AND m\.status <> 'scheduled'/i);
});

test('overdue enforcement notifies both players and is idempotent', () => {
  assert.match(migration, /CROSS JOIN LATERAL \(VALUES \(o\.challenger_id\), \(o\.challenged_id\)\)/i);
  // Re-running cannot re-match: the WHERE clause requires status='scheduled'.
  assert.match(migration, /WHERE c\.status\s*=\s*'scheduled'/i);
});

// --- Pre-match reminders ----------------------------------------------------

test('reminders claim the match in the same statement that sends them', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.send_match_reminders\(\)/i);
  assert.match(migration, /SET reminder_sent_at = NOW\(\)/i);
  assert.match(migration, /AND m\.reminder_sent_at IS NULL/i);
  assert.match(migration, /'match_reminder'/);
  assert.match(migration, /CROSS JOIN LATERAL \(VALUES \(d\.player1_id\), \(d\.player2_id\)\)/i);
});

test('the reminder lead time is configurable and a non-positive value disables it', () => {
  assert.match(migration, /SELECT match_reminder_hours INTO v_lead_hours FROM public\.league_settings/i);
  assert.match(migration, /IF v_lead_hours <= 0 THEN\s*\n\s*RETURN 0;/i);
  assert.match(migration, /make_interval\(hours => v_lead_hours\)/i);
});

// --- Privilege and scheduling hygiene ---------------------------------------

test('both new scheduled functions are locked to service_role', () => {
  for (const fn of ['expire_overdue_matches', 'send_match_reminders']) {
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM anon, authenticated`, 'i'));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(\\) TO service_role`, 'i'));
  }
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.(expire_overdue_matches|send_match_reminders)\(\) TO authenticated/i);
});

test('both scheduled functions pin their search_path', () => {
  const definers = migration.match(/SECURITY DEFINER\s*\n\s*SET search_path = public/gi) ?? [];
  assert.equal(definers.length, 2);
});

test('cron wiring follows the existing guarded, re-runnable pattern', () => {
  assert.match(migration, /IF EXISTS \(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'\)/i);
  for (const job of ['overdue-match-check', 'match-reminder-check']) {
    assert.match(migration, new RegExp(`IF EXISTS \\(SELECT 1 FROM cron\\.job WHERE jobname = '${job}'\\)`, 'i'));
    assert.match(migration, new RegExp(`PERFORM cron\\.unschedule\\('${job}'\\)`, 'i'));
    assert.match(migration, new RegExp(`'${job}',`, 'i'));
  }
});

test('the migration is safe against a database that already has these objects', () => {
  // Production runs ahead of this repo's migration history, so every statement
  // here has to be re-runnable.
  assert.doesNotMatch(migration, /^\s*CREATE TABLE (?!IF NOT EXISTS)/im);
  assert.doesNotMatch(migration, /^\s*CREATE INDEX (?!IF NOT EXISTS)/im);
  assert.doesNotMatch(migration, /ADD COLUMN (?!IF NOT EXISTS)/i);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS challenges_cancel_reason_check/i);
});

// --- Types ------------------------------------------------------------------

test('the generated types carry the new columns', () => {
  assert.match(databaseTypes, /cancel_reason: 'wash' \| 'withdrawn' \| 'overdue' \| null;/);
  assert.match(databaseTypes, /reminder_sent_at: string \| null;/);
});

// --- Encoding ---------------------------------------------------------------

test('nothing added in this package reintroduces mojibake or a BOM', () => {
  for (const [name, source] of Object.entries({ migration, submitResult, createChallenge, respondToChallenge })) {
    assert.doesNotMatch(source, /Ã.|â€|ðŸ/, `${name} contains mojibake`);
    assert.ok(!source.startsWith('﻿'), `${name} starts with a BOM`);
  }
});
