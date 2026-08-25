// The Admin Rankings tab reported success while every browser-side UPDATE was
// rejected. This pins both halves of the repair: one transactional RPC in the
// database, and a UI that checks the returned error before saying "Saved".

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/migrations/20260825130000_admin_reorder_rankings.sql');
const adminPage = read('src/pages/AdminPage.tsx');
const rankingsTab = adminPage.slice(
  adminPage.indexOf('function RankingsTab'),
  adminPage.indexOf('function PlayersTab'),
);

test('admin ranking changes use one transactional RPC', () => {
  assert.match(rankingsTab, /supabase\.rpc\('admin_reorder_rankings'/);
  assert.doesNotMatch(
    rankingsTab,
    /supabase\.from\('rankings'\)[\s\S]*?\.update\(/,
    'the admin tab must not return to parallel row updates against rankings.position UNIQUE',
  );
});

test('the admin tab reports save failures instead of unconditional success', () => {
  assert.match(rankingsTab, /const \{ error \} = await supabase\.rpc/);
  assert.match(rankingsTab, /if \(error\) \{/);
  assert.match(rankingsTab, /setSaveError\(failureMessage\('Could not save ranking order'/);
  assert.match(rankingsTab, /role="alert"/);

  const errorCheck = rankingsTab.indexOf('if (error)');
  const savedState = rankingsTab.indexOf('setSaved(true)');
  assert.ok(errorCheck !== -1 && savedState > errorCheck, 'Saved is set before the RPC error is checked');
});

test('the RPC is admin-gated and serialized with every other ladder mutation', () => {
  assert.match(migration, /p\.role IN \('admin', 'super_admin'\)/);
  assert.match(migration, /LOCK TABLE public\.rankings IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.doesNotMatch(migration, /SECURITY DEFINER/);
  assert.match(migration, /CREATE POLICY "Admins can update rankings"/);
  assert.match(migration, /CREATE POLICY "Admins can record audit events"/);
  assert.match(migration, /SET search_path = ''/);
});

test('the RPC parks rows before assigning the unique final positions', () => {
  assert.match(migration, /position = position \+ v_max_position/);
  assert.match(migration, /unnest\(p_player_ids\) WITH ORDINALITY/);
  assert.match(migration, /SET position = requested\.position::integer/);
});

test('the RPC requires the complete ladder and is not public or anonymous', () => {
  assert.match(migration, /cardinality\(p_player_ids\) <> v_player_count/);
  assert.match(migration, /count\(DISTINCT requested\.player_id\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_reorder_rankings\(uuid\[\]\) FROM PUBLIC/);
  assert.match(migration, /FROM anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_reorder_rankings\(uuid\[\]\) TO authenticated/);
});
