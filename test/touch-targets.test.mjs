// Standalone links and buttons were smaller than a fingertip.
//
// WCAG 2.5.8 (AA) sets 24x24 CSS pixels as the floor for a pointer target.
// Measured in a real browser at 375x812, the login screen's "Trouble signing
// in?" link rendered 133x20 -- a text-sized hit area on an app whose members
// use it one-handed, standing at a pool table, in a bar.
//
// The exception in 2.5.8 is for targets *inline in a sentence*, where enlarging
// the box would wreck the line. None of these are that: every one sits on its
// own line or alone in a flex row, so the exception does not cover them.
//
// The two that share a row with a heading use `py-1.5 -my-1.5`: the padding
// grows the hit area and the negative margin absorbs it again, so the target
// gets bigger while the layout does not move at all.
//
// This file asserts the padding is still there. It cannot measure rendered
// pixels -- that was done in the browser, and the login link came back 133x36 --
// but it does catch the padding being dropped, which is how the size would
// regress.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p) => readFileSync(join(root, p), 'utf8');

// [file, a snippet identifying the control, what its class list must contain]
const TARGETS = [
  ['src/pages/LoginPage.tsx', 'Trouble signing in?', /py-2/, 'the sign-in help link'],
  ['src/pages/ChallengesPage.tsx', 'Read the league rules', /py-1\.5/, 'the rules link under the challenge list'],
  ['src/pages/HomePage.tsx', 'Read the full league rules', /py-1\.5/, 'the rules button on the empty state'],
];

for (const [file, needle, padding, description] of TARGETS) {
  test(`${description} has a finger-sized hit area`, () => {
    const src = read(file);
    const idx = src.indexOf(needle);
    assert.notEqual(idx, -1, `could not find "${needle}" in ${file}; this guard is pointing at nothing`);
    // Look back to the start of the element that contains the label.
    const openTag = src.lastIndexOf('<', src.lastIndexOf('className', idx));
    const element = src.slice(openTag, idx);
    assert.match(
      element,
      padding,
      `${description} lost its vertical padding, so it renders about 20px tall -- under the 24px WCAG 2.5.8 floor`,
    );
  });
}

test('the "View all" buttons keep their layout-neutral hit area', () => {
  const src = read('src/pages/HomePage.tsx');
  const matches = [...src.matchAll(/py-1\.5 -my-1\.5/g)];
  assert.ok(
    matches.length >= 2,
    'the py-1.5 -my-1.5 pairs are gone. The negative margin is what lets these grow ' +
      'without pushing their heading row around; padding alone would move the layout, ' +
      'and no padding leaves a ~16px target.',
  );
});

// ---------------------------------------------------------------------------
// The authenticated chrome
// ---------------------------------------------------------------------------
// BottomNav, TopHeader, SideMenu and the FAB are the controls a member touches
// most -- on a phone, one-handed, standing at a pool table -- and they were the
// ones that could not be measured. They never render on the sign-in screen, and
// jsdom has no layout engine, so getBoundingClientRect there returns zeros.
//
// dev/tap-audit.html mounts them in a real browser at 375x812 with no session
// required. Measured there:
//
//   before   15 controls, 0 under 24px, but 7 under 44px --
//            the header menu button at 40x40 and all six nav tabs at 42px tall
//   after    15 controls, smallest exactly 44x44
//
// So AA (2.5.8, 24px) already passed; AAA (2.5.5, 44px) missed by 2-4px on the
// most-used controls in the app. The tabs already carried min-w-[44px], which
// says someone aimed for 44 and set only the width.
//
// These assertions pin the classes that produce that geometry. They cannot
// measure pixels -- that is what the harness is for -- but dropping the class is
// how the size regresses.
const bottomNav = read('src/components/BottomNav.tsx');
const topHeader = read('src/components/TopHeader.tsx');

test('the bottom nav tabs are a full 44px in both directions', () => {
  const tabs = bottomNav.match(/min-w-\[44px\] min-h-\[44px\]/g) ?? [];
  assert.ok(
    tabs.length >= 2,
    'the nav tabs lost min-h-[44px]; width alone leaves them 42px tall, which is what this fixed',
  );
});

test('the header menu button is 44px, not 40', () => {
  // p-2 around a 24px icon is exactly 40px. The explicit minimum is what makes
  // it 44 regardless of the icon inside it.
  assert.match(
    topHeader,
    /min-w-\[44px\] min-h-\[44px\]/,
    'the menu button is back to p-2 alone, which renders 40x40',
  );
});

test('the measuring harness still exists and ships nothing', () => {
  // If the harness is deleted, the authenticated chrome becomes unmeasurable
  // again and these class assertions are all that is left.
  const harness = read('dev/tap-audit.tsx');
  assert.match(harness, /BottomNav/);
  assert.match(harness, /TopHeader/);
  // Not referenced by vite.config or index.html, so `npm run build` never sees
  // it -- verified: 0 tap-audit chunks in dist.
  const viteConfig = read('vite.config.ts');
  assert.doesNotMatch(viteConfig, /tap-audit/, 'the harness must not become a build entry point');
});
