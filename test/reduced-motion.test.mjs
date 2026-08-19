// The app honoured the OS "reduce motion" setting nowhere.
//
// 27 components animate through Framer Motion and index.css carries a dozen
// keyframes, every decorative one running `infinite`. Measured on the login
// screen alone, six animations were running at once before this landed:
// ekg-boot, drift1, drift2, drift3 and two float-up particles -- ambient
// translate-and-scale motion, forever, on a phone 72 people open every day.
//
// That is WCAG 2.3.3, and for anyone with vestibular sensitivity it is the
// difference between using the app and not.
//
// Two mechanisms are required and neither is sufficient alone:
//
//   index.css  covers CSS keyframes and transitions
//   App.tsx    covers Framer Motion, which writes transforms straight onto
//              element style where no stylesheet rule can reach them
//
// These assertions exist because both are easy to delete by accident and
// nothing else in the suite would notice: the app looks and behaves identically
// for anyone who does not set the preference, which is almost everyone testing
// it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p) => readFileSync(join(root, p), 'utf8');

const indexCss = read('src/index.css');
const appTsx = read('src/App.tsx');
const loginPage = read('src/pages/LoginPage.tsx');

test('the stylesheet answers prefers-reduced-motion', () => {
  assert.match(
    indexCss,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
    'index.css has no prefers-reduced-motion block; every CSS keyframe runs regardless of the setting',
  );
});

test('reduced motion is opt-out, not a list of known animations', () => {
  // A blanket selector, not an enumeration. An allowlist of the animations that
  // exist today needs somebody to remember to extend it, and motion added next
  // month would ship unsuppressed. This repo has been bitten repeatedly by
  // controls that depend on someone remembering.
  const block = indexCss.slice(indexCss.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(block, /\*,\s*\*::before,\s*\*::after/, 'the reduce block must apply to everything by default');
  assert.match(block, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(block, /animation-iteration-count:\s*1\s*!important/);
  assert.match(block, /transition-duration:\s*0\.01ms\s*!important/);
});

test('busy indicators keep moving, because there the motion is the information', () => {
  // A frozen spinner reads as a hung app. This is the one deliberate exception,
  // and it must stay infinite or the blanket rule above swallows it.
  const block = indexCss.slice(indexCss.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(block, /\.animate-spin/, 'the spinner exception is gone; a loading spinner will freeze');
  const spinRule = block.slice(block.indexOf('.animate-spin'));
  assert.match(spinRule, /infinite\s*!important/, 'the spinner must keep its infinite iteration count');
});

test('Framer Motion follows the system preference', () => {
  // CSS cannot reach Framer Motion: it applies transforms via inline style.
  // MotionConfig is the only place this can be set once for all 27 files.
  assert.match(appTsx, /import\s*\{[^}]*MotionConfig[^}]*\}\s*from\s*'framer-motion'/);
  assert.match(
    appTsx,
    /<MotionConfig\s+reducedMotion="user"/,
    'MotionConfig reducedMotion="user" is missing; every Framer animation ignores the OS setting',
  );
  // "user" follows the system preference. "always" would strip motion from
  // people who never asked, and "never" is the broken state this replaced.
  assert.doesNotMatch(appTsx, /reducedMotion="never"/);
});

test('the league name is announced as words, not run together', () => {
  // It was `TOP OF THE<br />CAPITAL`. A <br> is not a word separator in
  // accessible-name computation, so it announced as "TOP OF THECAPITAL" on the
  // first screen a screen-reader user ever reaches.
  //
  // Splitting into two block-level spans does NOT fix it -- verified in Chrome,
  // the computed name was still "TOP OF THECAPITAL". Only an explicit name does.
  assert.match(
    loginPage,
    /aria-label="Top of the Capital"/,
    'the h1 needs an explicit accessible name; its visual line break does not create one',
  );
  // Comments are stripped before this check. The code comment beside the fix
  // quotes the old broken markup verbatim in order to explain it, and a guard
  // against markup that fires on prose describing that markup is a guard that
  // cries wolf -- it failed exactly that way when first written.
  const withoutComments = loginPage
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(
    withoutComments,
    /TOP OF THE<br\s*\/?>CAPITAL/,
    'the <br> form is back in the markup, which is what produced "TOP OF THECAPITAL"',
  );
});
