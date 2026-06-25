import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

const selfEscalationMigration = read('supabase/migrations/20260625000000_fix_self_escalation_rls.sql');
const raceCapMigration = read('supabase/migrations/20260625020000_remove_race_length_max_cap.sql');
const perfIndexes = read('supabase/migrations/20260625010000_add_performance_indexes.sql');
const sendPush = read('supabase/functions/send-push/index.ts');
const createChallenge = read('supabase/functions/create-challenge/index.ts');
const submitResult = read('supabase/functions/submit-result/index.ts');
const matchesPage = read('src/pages/MatchesPage.tsx');
const challengesPage = read('src/pages/ChallengesPage.tsx');

// --- Security: RLS self-escalation guards (PR #28) ---

test('profile UPDATE policy pins role to its existing value so users cannot self-promote', () => {
  assert.match(selfEscalationMigration, /CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE/i);
  assert.match(selfEscalationMigration, /role = \(SELECT role FROM profiles WHERE id = auth\.uid\(\)\)/i);
});

test('player UPDATE policy pins is_active so users cannot reactivate themselves', () => {
  assert.match(selfEscalationMigration, /CREATE POLICY "Players can update own player record" ON players FOR UPDATE/i);
  assert.match(selfEscalationMigration, /is_active = \(SELECT is_active FROM players WHERE profile_id = auth\.uid\(\)\)/i);
});

test('send-push rejects unauthenticated callers', () => {
  assert.match(sendPush, /supabase\.auth\.getUser\(/);
  assert.match(sendPush, /status:\s*401/);
  assert.match(sendPush, /Unauthorized/);
});

// --- Canon: race length min 6, no maximum (PR #29 fix) ---

test('race-length DB constraint enforces the minimum but keeps no maximum cap', () => {
  assert.match(raceCapMigration, /ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_race_length_check/i);
  assert.match(raceCapMigration, /CHECK \(race_length >= 6\)/i);
  // The reintroduced upper bound must be gone from the constraint definition
  // (ignore SQL comment lines, which reference the old cap for context).
  const sql = raceCapMigration.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(sql, /race_length\s*<=\s*\d+/);
});

// --- Performance: batched / parallel queries (PR #29) ---

test('submit-result batches the match-fee duplicate check instead of querying per payer', () => {
  assert.match(submitResult, /const alreadyRecorded = new Set\(/);
  assert.match(submitResult, /\.in\('actor_player_id', payers\.map/);
  // No per-row await inside a payers loop.
  assert.doesNotMatch(submitResult, /for\s*\(\s*const\s+\w+\s+of\s+payers\s*\)/);
});

test('create-challenge parallelizes independent stat reads and updates', () => {
  assert.match(createChallenge, /await Promise\.all\(\[\s*supabase\.from\('player_season_stats'\)/);
  assert.match(createChallenge, /const \[\{ data: challengerPlayer \}, \{ data: challengedPlayer \}\] = await Promise\.all\(/);
});

test('matches and challenges pages memoize player-name lookups in a Map (no O(N^2) find per row)', () => {
  for (const page of [matchesPage, challengesPage]) {
    assert.match(page, /const playerNameById = useMemo\(/);
    assert.match(page, /new Map\(rankings\.map\(/);
    assert.match(page, /getPlayerName = \(id: string\) => playerNameById\.get\(id\)/);
  }
});

test('performance index migration covers the actual match and challenge query predicates', () => {
  assert.ok(existsSync(join(root, 'supabase/migrations/20260625010000_add_performance_indexes.sql')));
  assert.match(perfIndexes, /CREATE INDEX IF NOT EXISTS idx_matches_player1 ON matches\(player1_id, status\)/i);
  assert.match(perfIndexes, /CREATE INDEX IF NOT EXISTS idx_matches_player2 ON matches\(player2_id, status\)/i);
  assert.match(perfIndexes, /CREATE INDEX IF NOT EXISTS idx_challenges_challenger_created ON challenges\(challenger_id, created_at DESC\)/i);
});
