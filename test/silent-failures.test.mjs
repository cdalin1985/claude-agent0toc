// Reads that threw their error away and rendered the result as an empty state.
//
// The repo already diagnosed this once, in lib/treasury.ts, and the comment
// there is the whole principle:
//
//   "Throw rather than fall back to zeros. Swallowing these made a failed read
//    indistinguishable from an empty treasury ... For a ledger, a wrong number
//    stated confidently is worse than an error."
//
// The same pattern was still live on the two screens members look at most.
// `const { data } = await supabase...; return data ?? []` never sets an error,
// so TanStack never enters an error state, so the page renders its empty
// branch -- and every one of these empty branches is a claim:
//
//   "no challenges waiting"      while a 48-hour response clock is running
//   "nothing needs your action"  while a match is waiting to be confirmed
//   "No matches yet."            on another member's public record
//   "No activity yet."           about the whole league
//   "#1 Obligation - 0/2"        an accusation with a drop to #10 attached
//
// The last one is the worst and is why this is not just tidiness. Three reads
// feed it; any of them failing produced a confident, false statement that the
// member at the top of the ladder was in breach of a rule.
//
// These pin that every read on those screens binds its error, and that the
// error branch is distinguishable from the empty branch in the markup.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const home = read('src/pages/HomePage.tsx');
const playerPage = read('src/pages/PlayerPage.tsx');
const settings = read('src/pages/SettingsPage.tsx');
const inlineError = read('src/components/InlineQueryError.tsx');

// `const { data } = await supabase` / `const { data: x } = await supabase`.
// Binding only `data` is exactly the shape that cannot fail loudly.
const UNBOUND_READ = /const \{\s*data(\s*:\s*\w+)?\s*\}\s*=\s*await supabase/g;

// The branch-ordering checks below look for the empty-state copy by name, and
// the comments explaining each fix quote that same copy. Strip comments first,
// or the search lands in the prose rather than the markup.
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('no read on the Home screen discards its error', () => {
  const hits = home.match(UNBOUND_READ) ?? [];
  assert.deepEqual(
    hits,
    [],
    `${hits.length} read(s) on HomePage bind only \`data\`, so a failure renders as an empty card`,
  );
});

test('no read on a player profile discards its error', () => {
  const hits = playerPage.match(UNBOUND_READ) ?? [];
  assert.deepEqual(
    hits,
    [],
    `${hits.length} read(s) on PlayerPage bind only \`data\`, so a failure reads as "never played"`,
  );
});

test('all three reads behind the #1 obligation card throw', () => {
  // Named individually rather than counted. The failure that matters is one of
  // the three quietly going back to a bare `data` binding: the other two would
  // still throw, the card would still render, and it would render 0/2.
  for (const binding of ['error: rankErr', 'error: top5Err', 'error: countErr']) {
    assert.match(home, new RegExp(binding.replace(':', ':\\s*')));
  }
  for (const thrown of ['throw rankErr', 'throw top5Err', 'throw countErr']) {
    assert.match(home, new RegExp(thrown));
  }
});

test('a failed obligation check shows nothing rather than an accusation', () => {
  // The query returning undefined on error is only safe because the card is
  // gated on the value being present. If that gate is ever loosened, a thrown
  // read starts rendering as 0/2 again.
  assert.match(home, /\{isRank1 && rank1Compliance && \(/);
});

test('the Home screen says so when part of it did not load', () => {
  // A total outage is caught by the rankings check, which takes over the
  // screen. This is the partial case: the cards are rendered on `.length > 0`,
  // so without this a failed read removes the card and the screen calmly
  // reports there is nothing to do.
  assert.match(home, /pendingError \|\| actionError \|\| notificationsError \|\| busyError/);
  assert.match(home, /<InlineQueryError/);
});

test('"no activity yet" is not what a failed feed read renders', () => {
  // Ordering is the assertion: the error branch has to be tested before the
  // length check, or an errored feed (which is also empty) takes the empty
  // branch and makes a statement about the league.
  const src = codeOnly(home);
  const errorAt = src.indexOf('{feedError ?');
  const emptyAt = src.indexOf('No activity yet');
  assert.notEqual(errorAt, -1, 'the feed error branch is gone');
  assert.ok(errorAt < emptyAt, 'the feed empty branch is tested before the error branch');
  assert.match(src.slice(errorAt, emptyAt), /<InlineQueryError/);
});

test('"No matches yet." is not what a failed history read renders', () => {
  const src = codeOnly(playerPage);
  const errorAt = src.indexOf('matchesError ?');
  const emptyAt = src.indexOf('No matches yet.');
  assert.notEqual(errorAt, -1, 'the match-history error branch is gone');
  assert.ok(errorAt < emptyAt, 'the match-history empty branch is tested before the error branch');
  assert.match(src.slice(errorAt, emptyAt), /<InlineQueryError/);
});

test('the inline notice announces itself and is not the full-screen one', () => {
  // It appears after load, in response to something going wrong, so a screen
  // reader should not have to be asked.
  assert.match(inlineError, /role="alert"/);
  // Colours the contrast audit already clears; a copy-paste of a dimmer grey
  // would pass this file and fail text-contrast.test.mjs.
  assert.match(inlineError, /text-\[#E8E2D6\]/);
});

// ---------------------------------------------------------------------------
// Deliberately exempt
// ---------------------------------------------------------------------------

test('the Settings re-reads stay exempt, on purpose', () => {
  // SettingsPage has five `const { data } = await supabase` reads and they are
  // correct as they stand. Each one re-reads the player row AFTER a write that
  // is already error-checked with a member-readable message, purely to refresh
  // the store: `if (data) setPlayer(data)`.
  //
  // If that refresh fails the write still succeeded, and the right behaviour is
  // exactly what it does -- keep showing the old value until the next load.
  // Making these throw would raise an error for an operation that worked, which
  // is a worse lie than the one this file exists to remove.
  //
  // Pinned so a future sweep for the pattern above reads this before "fixing"
  // them, and so the exemption stops applying if the writes above them ever
  // lose their error checks.
  const reads = settings.match(UNBOUND_READ) ?? [];
  assert.equal(reads.length, 5, 'the Settings re-read count changed; re-check whether the exemption still holds');
  assert.match(settings, /if \(data\) setPlayer\(data\)/);
  for (const guarded of [
    /if \(uploadErr\) \{ setBannerError/,
    /if \(saveErr\) \{ setBannerError/,
    /if \(saveErr\) \{ setAvatarError/,
  ]) {
    assert.match(settings, guarded, 'a Settings write lost its error check, so the re-reads are no longer benign');
  }
});
