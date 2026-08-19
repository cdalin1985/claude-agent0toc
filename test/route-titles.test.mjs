// Every route shared one page title, and navigating announced nothing.
//
// A full page load sets a new document title and moves the screen reader into a
// new document. Client-side routing does neither, and nothing here filled the
// gap, so all 16 routes reported "Top of the Capital — Helena Pool League" and
// tapping "Rankings" with a screen reader produced silence. WCAG 2.4.2 is Level
// A; this was failing it on every screen.
//
// The check that matters is not "does a title map exist" -- it is "does the map
// still cover the routes". A route added next month with no title entry silently
// falls back to the bare suffix, which is the exact state this replaced. So the
// route table is read out of App.tsx and every path is run through the real
// patterns from pageTitles.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p) => readFileSync(join(root, p), 'utf8');

const appTsx = read('src/App.tsx');
const layout = read('src/components/Layout.tsx');
const announcer = read('src/components/RouteAnnouncer.tsx');
const titlesSrc = read('src/lib/pageTitles.ts');

// Rebuild the real patterns from the module rather than restating them here, so
// this cannot drift into testing a copy of the table instead of the table.
function loadPatterns() {
  const body = titlesSrc.slice(titlesSrc.indexOf('const TITLES'), titlesSrc.indexOf('];'));
  const entries = [...body.matchAll(/\[(\/[^,]+?\/),\s*'([^']+)'\]/g)];
  assert.ok(entries.length > 0, 'could not parse the TITLES table out of pageTitles.ts');
  return entries.map(([, pattern, name]) => {
    const lastSlash = pattern.lastIndexOf('/');
    return [new RegExp(pattern.slice(1, lastSlash), pattern.slice(lastSlash + 1)), name];
  });
}

const pageNameFor = (pathname) => {
  for (const [re, name] of loadPatterns()) if (re.test(pathname)) return name;
  return null;
};

// The routes the app actually serves, minus the catch-all redirect.
const routePaths = [...appTsx.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => p !== '*');

test('the app declares routes this test can see', () => {
  assert.ok(routePaths.length >= 15, `only found ${routePaths.length} routes in App.tsx`);
});

test('every route has a page title', () => {
  const missing = routePaths.filter((p) => {
    // React Router params never appear literally in a URL; substitute a value
    // so the pattern is tested against something a browser would really show.
    const concrete = p.replace(/:[A-Za-z]+/g, '123');
    return pageNameFor(concrete) === null;
  });
  assert.deepEqual(
    missing,
    [],
    `these routes fall back to the bare suffix, which is the bug this replaced: ${missing.join(', ')}`,
  );
});

test('page titles are distinct enough to tell tabs apart', () => {
  const names = routePaths.map((p) => pageNameFor(p.replace(/:[A-Za-z]+/g, '123')));
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  const duplicated = [...counts].filter(([, c]) => c > 1).map(([n]) => n);
  assert.deepEqual(duplicated, [], `these titles are shared by more than one route: ${duplicated.join(', ')}`);
});

test('the title is actually written to the document', () => {
  assert.match(announcer, /document\.title = documentTitleFor\(pathname\)/);
});

test('route changes are announced politely, not assertively', () => {
  // assertive interrupts whatever the user is currently hearing. A page change
  // should wait its turn.
  assert.match(announcer, /aria-live="polite"/);
  assert.doesNotMatch(announcer, /aria-live="assertive"/);
  assert.match(announcer, /role="status"/);
  assert.match(announcer, /className="sr-only"/, 'the announcer must not be visible on screen');
});

test('the announcer is mounted', () => {
  assert.match(layout, /<RouteAnnouncer \/>/, 'RouteAnnouncer is defined but never rendered');
});

test('there is a skip link, and it targets a real element', () => {
  // WCAG 2.4.1. The header, menu button and bottom nav all precede the content
  // in tab order on every route.
  assert.match(layout, /href="#main-content"/, 'the skip link is gone');
  assert.match(layout, /id="main-content"/, 'the skip link target is gone');
  // Without tabIndex={-1} focus never lands on <main>, so the next Tab resumes
  // at the top of the page and the link does nothing useful.
  assert.match(layout, /tabIndex=\{-1\}/, 'the skip target must be focusable via -1');
});

test('the skip link is hidden until focused, then actually visible', () => {
  const link = layout.slice(layout.indexOf('href="#main-content"'));
  const tag = link.slice(0, link.indexOf('</a>'));
  assert.match(tag, /sr-only/, 'the skip link must be hidden until focused');
  assert.match(tag, /focus:not-sr-only/, 'the skip link must become visible on focus');
  // The sticky header sits above the page; without a z-index the link renders
  // behind it and a keyboard user sees nothing.
  assert.match(tag, /focus:z-\[100\]/, 'the skip link needs to sit above the sticky header');
});
