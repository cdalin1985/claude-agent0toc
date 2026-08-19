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
