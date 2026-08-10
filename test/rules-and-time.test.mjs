import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const migration = read('supabase', 'migrations', '20260807120000_enforce_match_window_and_reminders.sql');
const cooldownMigration = read('supabase', 'migrations', '20260807130000_unify_post_match_cooldowns.sql');
const resolveDispute = read('supabase', 'functions', 'resolve-dispute', 'index.ts');
const submitResult = read('supabase', 'functions', 'submit-result', 'index.ts');
const createChallenge = read('supabase', 'functions', 'create-challenge', 'index.ts');
const respondToChallenge = read('supabase', 'functions', 'respond-to-challenge', 'index.ts');
const databaseTypes = read('src', 'types', 'database.ts');
const rulesPage = read('src', 'pages', 'RulesPage.tsx');
const adminPage = read('src', 'pages', 'AdminPage.tsx');

// --- README rule: a winner who climbs also cools down -----------------------

test('a win that moves the winner up the list creates a cooldown for them too', () => {
  // README: "If you win (lower seed beats higher seed): ... You must wait 24
  // hours before challenging up again."
  assert.match(submitResult, /async function createPostMatchCooldowns\(/);
  assert.match(submitResult, /climberId: string \| null/);
  assert.match(submitResult, /p_climber_id: climberId,/);
  // The old loser-only helper must be gone, not merely unused.
  assert.doesNotMatch(submitResult, /createPostLossCooldown/);
});

test('the climber cooldown is keyed off an actual ranking change, not merely winning', () => {
  // README: "If you defend your spot (higher seed wins): You can challenge up
  // immediately". rankChange is set only on the climb branch, so a successful
  // defence passes null and gets no cooldown.
  assert.match(submitResult, /createPostMatchCooldowns\(supabase, loserId, rankChange \? winnerId : null\)/);
});

test('the climb branch is entered on a lower seed winning, and rankChange is set only there', () => {
  // This is the line the whole rule turns on. Flip it to `wPos < lPos` and the
  // cooldown inverts -- defenders punished, climbers free -- with every other
  // assertion in this file still passing. Positions are 1-based, so the winner
  // having the HIGHER number means they were the lower seed and climbed.
  const climbBranch = submitResult.match(/if \(wPos > lPos\) \{[\s\S]*?\n {4}\}/);
  assert.ok(climbBranch, 'expected a `if (wPos > lPos) {` climb branch in confirmResult');
  assert.match(climbBranch[0], /rankChange = \{/);
  assert.match(climbBranch[0], /cascade_ranking_after_win/);
  // rankChange must not be assigned anywhere outside that branch.
  const assignments = submitResult.match(/rankChange = /g) ?? [];
  assert.equal(assignments.length, 1, 'rankChange should be assigned exactly once, inside the climb branch');
});

test('a post-match cooldown blocks challenging up but not challenging down', () => {
  // README:17 grants top-10 players a challenge DOWN 5 spots, and README:32/:38
  // put the cooldown specifically on challenging up.
  assert.match(createChallenge, /if \(myCooldown && theirPos < myPos\) return/);
  assert.match(createChallenge, /You can still challenge down/);
});

test('the ranking reads that gate the cascade, stats and cooldowns are not swallowed', () => {
  assert.match(submitResult, /if \(winnerRank\.error\) throw winnerRank\.error;/);
  assert.match(submitResult, /if \(loserRank\.error\) throw loserRank\.error;/);
});

test('cooldown length still comes from league_settings rather than a literal', () => {
  assert.match(cooldownMigration, /SELECT cooldown_hours INTO v_hours/i);
  assert.match(cooldownMigration, /v_hours := COALESCE\(v_hours, 24\);/i);
  assert.match(cooldownMigration, /IF v_hours <= 0 THEN\s*\n\s*RETURN ARRAY\[NULL, NULL\]::uuid\[\];/i);
  assert.doesNotMatch(cooldownMigration, /make_interval\(hours => 24\)/i);
});

test('the cooldown rule has exactly one implementation, called by all three paths', () => {
  // It was previously written three times with three different answers.
  assert.match(cooldownMigration, /CREATE OR REPLACE FUNCTION public\.apply_post_match_cooldowns\(/i);
  assert.match(submitResult, /\.rpc\('apply_post_match_cooldowns', \{/);
  assert.match(resolveDispute, /\.rpc\('apply_post_match_cooldowns', \{/);
  assert.match(cooldownMigration, /v_cooldown_ids := public\.apply_post_match_cooldowns\(/i);
  // No path may keep its own inline cooldown INSERT.
  assert.doesNotMatch(submitResult, /from\('cooldowns'\)\.insert/);
  assert.doesNotMatch(resolveDispute, /from\('cooldowns'\)\.insert/);
});

test('a challenger who climbs by decline-forfeit gets the cooldown too', () => {
  // The loophole this series exists to close, reached by a different door:
  // challenge up, opponent declines, you climb, challenge up again immediately.
  assert.match(cooldownMigration, /v_challenger_climbed := v_challenger_previous_position IS NOT NULL/i);
  assert.match(cooldownMigration, /CASE WHEN v_challenger_climbed THEN v_challenge\.challenger_id END/i);
  // The same flag gates the cascade, so the cooldown cannot drift from the
  // condition that decides whether anyone actually moved.
  assert.match(cooldownMigration, /IF v_challenger_climbed THEN\s*\n\s*PERFORM public\.cascade_ranking_after_win/i);
});

test('a resolved dispute applies the same cooldown as a cleanly confirmed match', () => {
  // Includes the admin Force Forfeit button, which comes through this path.
  assert.match(resolveDispute, /const winnerClimbed = Boolean\(winnerRank\.data && loserRank\.data && winnerRank\.data\.position > loserRank\.data\.position\);/);
  assert.match(resolveDispute, /p_climber_id: winnerClimbed \? winner_id : null,/);
  assert.match(resolveDispute, /if \(cooldownError\) throw cooldownError;/);
});

test('reversing a decline unwinds both cooldowns, not just the decliner s', () => {
  // challenge_forfeiture_events.cooldown_id is a single uuid; without a second
  // column the challenger is left blocked by a cooldown for a forfeit that no
  // longer exists.
  assert.match(cooldownMigration, /ADD COLUMN IF NOT EXISTS challenger_cooldown_id uuid REFERENCES public\.cooldowns\(id\) ON DELETE SET NULL/i);
  assert.match(cooldownMigration, /IF v_event\.challenger_cooldown_id IS NOT NULL THEN\s*\n\s*DELETE FROM public\.cooldowns WHERE id = v_event\.challenger_cooldown_id;/i);
  assert.match(cooldownMigration, /v_cooldown_id, v_challenger_cooldown_id, v_activity_event_id, v_notification_ids,/);
});

test('the shared cooldown helper is locked to service_role like every other definer', () => {
  assert.match(cooldownMigration, /REVOKE ALL ON FUNCTION public\.apply_post_match_cooldowns\(uuid, uuid\) FROM anon, authenticated/i);
  assert.match(cooldownMigration, /GRANT EXECUTE ON FUNCTION public\.apply_post_match_cooldowns\(uuid, uuid\) TO service_role/i);
  assert.doesNotMatch(cooldownMigration, /GRANT EXECUTE ON FUNCTION public\.[a-z_]+\(uuid, uuid\) TO (anon|authenticated)/i);
  // Redefining the two forfeit functions must not silently re-open their grants.
  for (const fn of ['apply_challenge_decline_forfeit', 'reverse_challenge_decline_forfeit']) {
    assert.match(cooldownMigration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(uuid, uuid\\) FROM anon, authenticated`, 'i'));
    assert.match(cooldownMigration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(uuid, uuid\\) TO service_role`, 'i'));
  }
});

test('the helper never writes two cooldowns for the same player', () => {
  // create-challenge reads one active cooldown; two rows for one person would
  // be a self-inflicted data problem.
  assert.match(cooldownMigration, /IF p_climber_id IS NOT NULL AND p_climber_id IS DISTINCT FROM p_loser_id THEN/i);
});

test('the cooldown read tolerates a player holding two overlapping cooldowns', () => {
  // Reachable: lose a match, then decline a challenge inside the window.
  // maybeSingle() errors on more than one row, which the new error check would
  // turn into a 500 that blocks a legitimate challenge.
  assert.match(createChallenge, /\.order\('expires_at', \{ ascending: false \}\)\s*\n\s*\.limit\(1\);/);
  assert.match(createChallenge, /const myCooldown = activeCooldowns\?\.\[0\];/);
  assert.doesNotMatch(createChallenge, /\.gt\('expires_at', now\)\.maybeSingle\(\)/);
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

test('the wash and withdraw writes are guarded by their prior status AND act on the rowcount', () => {
  // A prior-status filter that nobody inspects is decoration: the handler would
  // still announce a wash it did not perform.
  assert.match(respondToChallenge, /\.in\('status', \['pending', 'accepted', 'scheduled'\]\)\s*\n\s*\.select\('id'\);/);
  assert.match(respondToChallenge, /if \(!washed\?\.length\) \{/);
  assert.match(respondToChallenge, /\.eq\('status', 'pending'\)\s*\n\s*\.select\('id'\);/);
  assert.match(respondToChallenge, /if \(!withdrawn\?\.length\) \{/);
});

test('a wash cannot void a match that is already under way', () => {
  // challenges.status stays 'scheduled' for the whole life of a match -- only
  // matches.status advances -- so without this a player losing 4-1 could tap
  // "Couldn't agree" and erase the loss at no cost.
  assert.match(respondToChallenge, /if \(existingMatch && existingMatch\.status !== 'scheduled'\) \{/);
  assert.match(respondToChallenge, /This match is already under way/);
  // And the match close is scoped, so one that starts mid-request survives.
  assert.match(respondToChallenge, /\.update\(\{ status: 'resolved' \}\)\.eq\('challenge_id', challenge_id\)\.eq\('status', 'scheduled'\)/);
});

test('the wash guard returns a conflict status rather than a bare 200', () => {
  const washBranch = respondToChallenge.match(/action === 'wash'[\s\S]*?action === 'cancel'/);
  assert.ok(washBranch, 'expected a wash branch');
  assert.equal((washBranch[0].match(/status: 409/g) ?? []).length, 2);
});

test('an admin cancelling a challenge does not charge the challenger for it', () => {
  assert.match(adminPage, /\.update\(\{ status: 'cancelled', cancel_reason: 'wash' \}\)/);
  assert.match(adminPage, /Could not cancel that challenge/);
});

test('an admin action error is cleared when a different action is opened', () => {
  // Otherwise a failed cancel on one challenge renders its red error inside the
  // next challenge's fresh panel.
  assert.match(adminPage, /setActionType\('cancel'\); setActionError\(''\);/);
  assert.match(adminPage, /setActionType\('forfeit'\); setWinnerId\(''\); setActionError\(''\);/);
  assert.match(adminPage, /setActionType\('reverse_decline'\); setActionError\(''\);/);
});

test('a failed forfeit is reported rather than closing the panel as if it worked', () => {
  // A forfeit moves ladder positions; silently failing is a standings problem.
  assert.match(adminPage, /Could not record that forfeit\. Nothing was changed\./);
  assert.match(adminPage, /The result was recorded but the challenge did not close/);
  assert.match(adminPage, /Connection problem — the forfeit was not recorded/);
});

test('a failed league-settings save is reported rather than showing Saved', () => {
  assert.match(adminPage, /setSaveError\(`Could not save: \$\{error\.message\}`\)/);
  assert.match(adminPage, /\{saveError && \(/);
});

test('the reminder lead time is reachable from the admin settings form', () => {
  assert.match(adminPage, /key: 'match_reminder_hours', label: 'Pre-match reminder'/);
  // 0 turns reminders off, so this one field must not inherit the min-of-1 floor.
  assert.match(adminPage, /unit: 'hours before the match \(0 = off\)', min: 0/);
  assert.match(adminPage, /function SettingsField\(\{ label, unit, value, onChange, min = 1 \}/);
  assert.match(adminPage, /match_reminder_hours: edits\.match_reminder_hours \?\? settings\.match_reminder_hours,/);
  // The cooldown label used to say "hours after a win", which was never the
  // whole rule and is now plainly wrong.
  assert.doesNotMatch(adminPage, /unit: 'hours after a win'/);
});

test('an unusable display_timezone falls back instead of killing reminders league-wide', () => {
  // AT TIME ZONE raises on an unknown zone, which would abort the statement,
  // roll back the reminder_sent_at claim, and silently stop every reminder.
  assert.match(migration, /NOT EXISTS \(SELECT 1 FROM pg_timezone_names WHERE name = v_timezone\)/i);
  assert.match(migration, /v_timezone := 'America\/Denver';/);
});

test('the in-app rulebook matches the shipped cooldown and play-window behaviour', () => {
  // RulesPage is the only rulebook most players will read. If it still says the
  // cooldown is loss-only, a blocked climber concludes the app is broken.
  // The loser's cooldown is unconditional (submit-result builds the loser row
  // before any rankChange test), so the copy must cover a challenger who loses
  // and does not move — the single most common outcome on the ladder — as well
  // as the climber. Only the successful defender is exempt.
  assert.match(rulesPage, /After you <strong>lose<\/strong> a match, or after a win that <strong>moves you up<\/strong> the list/);
  assert.match(rulesPage, /You can still challenge down/);
  assert.match(rulesPage, /Successfully defending your spot costs you nothing/);
  assert.match(rulesPage, /automatically ruled a wash/);
  assert.doesNotMatch(rulesPage, /After losing a match, you must wait/);
  assert.doesNotMatch(rulesPage, /you climbed, or you got passed/);
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

test('the migration creates the production-only columns it depends on', () => {
  // match_deadline, challenge_response_hours and match_play_days all exist in
  // production but appear nowhere in this repo's migration history. A database
  // built from these files alone lacked them, so indexing match_deadline failed
  // on a fresh replay while working fine against production. Caught by the
  // migration-replay CI job, which no static assertion could have caught.
  assert.match(migration, /ALTER TABLE public\.challenges\s+ADD COLUMN IF NOT EXISTS match_deadline TIMESTAMPTZ/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS challenge_response_hours INTEGER NOT NULL DEFAULT 48/i);
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
  // Phrased as NOT EXISTS(beyond scheduled) rather than EXISTS(scheduled) so a
  // challenge stranded at 'scheduled' with no match row at all is also cleared —
  // accept writes the challenge and the match non-atomically.
  assert.doesNotMatch(migration, /AND EXISTS \(\s*SELECT 1 FROM public\.matches m\s*WHERE m\.challenge_id = c\.id AND m\.status = 'scheduled'/i);
});

test('re-running overdue enforcement cannot act on the same challenge twice', () => {
  // The claim is idempotence, so assert the mechanism: the qualifier requires
  // status='scheduled' and the same statement writes status='cancelled', so a
  // second run has nothing to match.
  const fn = migration.match(/CREATE OR REPLACE FUNCTION public\.expire_overdue_matches[\s\S]*?\n\$\$;/);
  assert.ok(fn, 'expected expire_overdue_matches body');
  assert.match(fn[0], /SET status\s*=\s*'cancelled'/i);
  assert.match(fn[0], /WHERE c\.status\s*=\s*'scheduled'/i);
});

test('overdue notifications name the opponent so a player knows which match', () => {
  assert.match(
    migration,
    /CROSS JOIN LATERAL \(VALUES \(n\.challenger_id, n\.challenged_name\),\s*\n?\s*\(n\.challenged_id, n\.challenger_name\)\) AS p\(player_id, opponent_name\)/i,
  );
  assert.match(migration, /' match with ' \|\| p\.opponent_name/);
});

// --- Pre-match reminders ----------------------------------------------------

test('reminders claim the match in the same statement that sends them', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.send_match_reminders\(\)/i);
  assert.match(migration, /SET reminder_sent_at = NOW\(\)/i);
  assert.match(migration, /AND m\.reminder_sent_at IS NULL/i);
  assert.match(migration, /'match_reminder'/);
  assert.match(
    migration,
    /CROSS JOIN LATERAL \(VALUES \(n\.player1_id, n\.player2_name\),\s*\n?\s*\(n\.player2_id, n\.player1_name\)\) AS p\(player_id, opponent_name\)/i,
  );
});

test('the reminder lead time and display timezone are configurable, not literals', () => {
  assert.match(migration, /SELECT match_reminder_hours, display_timezone\s*\n\s*INTO v_lead_hours, v_timezone/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS display_timezone TEXT NOT NULL DEFAULT 'America\/Denver'/i);
  assert.match(migration, /AT TIME ZONE v_timezone/i);
  assert.match(migration, /IF v_lead_hours <= 0 THEN\s*\n\s*RETURN 0;/i);
  assert.match(migration, /make_interval\(hours => v_lead_hours\)/i);
  // The settings read must be deterministic if a second row ever appears.
  assert.match(migration, /ORDER BY updated_at DESC, id\s*\n\s*LIMIT 1;/i);
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
  for (const [name, source] of Object.entries({ migration, cooldownMigration, submitResult, createChallenge, respondToChallenge, resolveDispute })) {
    assert.doesNotMatch(source, /Ã.|â€|ðŸ/, `${name} contains mojibake`);
    assert.ok(!source.startsWith('﻿'), `${name} starts with a BOM`);
  }
});
