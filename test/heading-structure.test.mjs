// Two screens had no page heading at all, and two more skipped a level.
//
// Most screen-reader users navigate a page by jumping between headings, so the
// h1 is the thing that tells them what they just landed on. Measured before the
// fix:
//
//   HomePage    no h1 -- the landing screen. Its first heading was an h2 for
//               "Alerts", most of the way down the page.
//   MatchPage   no h1 -- first heading was an h2, "Who Won?", part-way into the
//               scoring flow.
//   AdminPage   h1 then four h3s, no h2 between them.
//   ChallengePage  h1 then an h3, same skip.
//
// A skipped level is not cosmetic: it implies a missing section that a reader
// then goes looking for.
//
// The two missing h1s are visually hidden. Both screens already announce
// themselves through the header and the route title, so drawing new text would
// have been a design change made to fix a structural problem.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const pagesDir = join(root, 'src/pages');

const pages = readdirSync(pagesDir)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ name: f.replace('.tsx', ''), src: readFileSync(join(pagesDir, f), 'utf8') }));

// AuthCallbackPage is a redirect shim -- it renders a spinner and navigates
// away, so it has no content to head.
const EXEMPT = new Set(['AuthCallbackPage']);

const levelsIn = (src) =>
  [...new Set([...src.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1])))].sort();

test('the page scan sees the app', () => {
  assert.ok(pages.length >= 15, `only ${pages.length} pages found; this guard would pass vacuously`);
});

test('every page has an h1', () => {
  const missing = pages
    .filter((p) => !EXEMPT.has(p.name))
    .filter((p) => !/<h1[\s>]/.test(p.src))
    .map((p) => p.name);
  assert.deepEqual(
    missing,
    [],
    `these screens have no page heading, so navigating by heading lands on nothing: ${missing.join(', ')}`,
  );
});

test('no page skips a heading level', () => {
  const skipped = [];
  for (const { name, src } of pages) {
    const levels = levelsIn(src);
    if (levels.length === 0) continue;
    for (let i = 1; i < levels.length; i += 1) {
      if (levels[i] - levels[i - 1] > 1) {
        skipped.push(`${name}: h${levels[i - 1]} -> h${levels[i]}`);
      }
    }
  }
  assert.deepEqual(
    skipped,
    [],
    `a skipped level implies a section that is not there: ${skipped.join(', ')}`,
  );
});

test('the hidden headings stay hidden, and stay named like their routes', () => {
  // If either becomes visible it is a design change nobody asked for; if either
  // is renamed, the tab title, the spoken route announcement and the heading
  // stop agreeing with each other.
  const home = pages.find((p) => p.name === 'HomePage').src;
  const match = pages.find((p) => p.name === 'MatchPage').src;
  assert.match(home, /<h1 className="sr-only">Home<\/h1>/);
  assert.match(match, /<h1 className="sr-only">Match<\/h1>/);

  const titles = readFileSync(join(root, 'src/lib/pageTitles.ts'), 'utf8');
  assert.match(titles, /'Home'/, 'the Home route title no longer matches its heading');
  assert.match(titles, /'Match'/, 'the Match route title no longer matches its heading');
});
