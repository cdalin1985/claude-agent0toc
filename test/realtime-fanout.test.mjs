// One ladder move was not one refetch, and the Home screen was not on realtime
// at all.
//
// cascade_ranking_after_win moves a block by parking it at position + 1000,
// placing the winner, then bringing the block back -- so a win costs roughly
// 2 x (spots climbed) + 2 row UPDATEs on `rankings`. Each is its own WAL record
// and so its own postgres_changes message, and `rankings` is in the realtime
// publication. Layout.tsx invalidated ['rankings'] on every one of them, and
// that query reads four whole tables. A 10-spot first challenge therefore cost
// every connected member ~22 full refetches of the ladder, at once.
//
// Separately, the Home screen's cards are keyed ['home-pending-challenges'] and
// ['home-action-matches'], which do not prefix-match ['challenges'] or
// ['matches']. Realtime never refreshed them; their 30-second polls were the
// only thing keeping them current, which is why the polls looked necessary.
//
// Neither is visible at 66 players and four recorded matches. Both are
// arithmetic in the number of members, which is the thing about to change.
//
// These pin the shape of the fix. There is no browser in this suite, so what is
// checked is the wiring: that a coalescing step exists between the socket and
// invalidateQueries, that every key a table feeds is named, and that no screen
// has quietly gone back to polling on a timer as its primary mechanism.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const layout = read('src/components/Layout.tsx');
const polling = read('src/lib/polling.ts');
const rankings = read('src/hooks/useRankings.ts');
const home = read('src/pages/HomePage.tsx');
const matchPage = read('src/pages/MatchPage.tsx');
const matchesPage = read('src/pages/MatchesPage.tsx');

// The realtime handler, without its comments -- every claim below is about code.
const realtimeBlock = layout
  .slice(layout.indexOf('// Realtime subscriptions'), layout.indexOf('// Offline detection'))
  .replace(/^\s*\/\/.*$/gm, '');

test('a burst of realtime messages is coalesced into one invalidation', () => {
  // The specific thing that must not come back: invalidateQueries called
  // directly from a postgres_changes handler, once per message.
  assert.match(realtimeBlock, /const pending = new Set<string>\(\)/);
  assert.match(realtimeBlock, /setTimeout\(flush, REALTIME_COALESCE_MS\)/);
  assert.match(realtimeBlock, /if \(timer === null\)/);
  assert.doesNotMatch(
    realtimeBlock,
    /'postgres_changes'[\s\S]{0,160}queryClient\.invalidateQueries/,
    'a postgres_changes handler invalidates directly again -- one ladder move is ~22 messages',
  );
});

test('the coalescing timer is cleared when the subscription tears down', () => {
  // A pending flush firing after unmount invalidates against a dead client.
  assert.match(realtimeBlock, /if \(timer !== null\) clearTimeout\(timer\)/);
  assert.match(realtimeBlock, /supabase\.removeChannel\(channel\)/);
});

test('every key a table actually feeds is invalidated when that table changes', () => {
  // The Home screen keys are the ones that were missing. They are listed
  // per-table rather than as one blanket invalidation so a wrong pairing --
  // matches refreshing the challenge cards, say -- still reads as wrong here.
  const expected = {
    rankings: ['rankings'],
    challenges: ['challenges', 'home-pending-challenges', 'active-challenge-player-ids'],
    matches: ['matches', 'home-action-matches', 'match', 'rank1-compliance'],
    notifications: ['notifications'],
    activity_feed: ['activity-feed', 'activity-feed-full'],
  };

  for (const [table, keys] of Object.entries(expected)) {
    const handler = realtimeBlock.match(
      new RegExp(`table: '${table}' \\}, \\(\\) => \\{([\\s\\S]*?)\\}\\)`),
    );
    assert.ok(handler, `no realtime handler found for ${table}`);
    for (const key of keys) {
      assert.match(
        handler[1],
        new RegExp(`'${key}'`),
        `a ${table} change does not refresh '${key}'`,
      );
    }
  }
});

test('polling is a named backstop, not a scattering of magic numbers', () => {
  // The intervals used to be 30000 written out in five places, which is how
  // they all stayed at 30 seconds long after realtime made them redundant.
  assert.match(polling, /export const BACKSTOP_POLL_MS = 120_000/);
  assert.match(polling, /export const LIVE_MATCH_POLL_MS = 15_000/);

  for (const [name, src] of Object.entries({
    'useRankings.ts': rankings,
    'Layout.tsx': layout,
    'HomePage.tsx': home,
    'MatchPage.tsx': matchPage,
  })) {
    assert.doesNotMatch(
      src,
      /refetchInterval:\s*\d/,
      `${name} sets refetchInterval to a literal again -- use the constants in lib/polling`,
    );
  }
});

test('the Home screen no longer polls three queries every 30 seconds', () => {
  // Three separate queries, each of which realtime now covers.
  const intervals = home.match(/refetchInterval: \w+/g) ?? [];
  assert.equal(intervals.length, 3);
  for (const i of intervals) assert.equal(i, 'refetchInterval: BACKSTOP_POLL_MS');
});

test('a member\'s match history query is bounded', () => {
  // The only query in the app that grew with a member's own history rather
  // than with the size of the league, and the only one with no ceiling.
  const historyQuery = matchesPage.match(/from\('matches'\)[\s\S]{0,320}?;/);
  assert.ok(historyQuery, 'could not find the match history query');
  assert.match(historyQuery[0], /\.limit\(\d+\)/);
});
