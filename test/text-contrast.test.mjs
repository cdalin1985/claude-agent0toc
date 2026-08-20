// Text colour contrast, computed rather than eyeballed.
//
// This does not grep for the specific colours that were wrong. It finds every
// `text-[#RRGGBB]` in src/ and measures each one against the two surfaces the
// app actually paints text on, so a low-contrast colour introduced next month
// fails here without anyone having to remember to extend a list.
//
// What it caught when written:
//
//   #6B7280   87 uses   4.02 / 3.60   the muted grey on timestamps, hints and
//                                     captions -- 55 of them at text-xs and 10
//                                     at text-sm, so squarely "normal text"
//   #71717A    2 uses   4.02 / 3.60   sign-out and help links
//   #C62828   20 uses   3.46 / 3.10   the brand red used as error text
//
// All three are below the 4.5:1 WCAG 1.4.3 asks for normal text. The greys were
// consolidated onto #9CA3AF, which already dominated the file at 129 uses and
// measures 7.66 / 6.86; the red onto #EF4444, already used 78 times and
// measuring 5.16 / 4.62. Both fixes removed a colour rather than adding one.
//
// The brand red is untouched as a fill or a border -- 34 bg- and 40 border-
// uses -- because non-text contrast is a 3:1 bar, which #C62828 clears.
//
// SCOPE, deliberately: this checks `text-[#RRGGBB]` classes only. It does NOT
// check colours set through inline style={{ color }}, and extending it to those
// would make it worse, not better.
//
// That was measured rather than assumed. Auditing the 16 inline colours against
// the page and card backgrounds produced 8 "failures", and every one was a false
// positive:
//
//   PoolBall        the ball colours -- #7B0323 is the 7 ball, #003DA5 the 2,
//                   #1A1A1A the 8 -- drawn as the ball's fill with the number on
//                   top. The component already picks white or dark for that
//                   number depending on the ball. Comparing a ball to the page
//                   background is meaningless.
//   OfflineBanner   dark text that sits on the banner's own bright background,
//                   set two lines away.
//   HomePage:397    #C62828 at text-2xl AND font-bold, which is large text --
//                   a 3:1 bar, and it measures 3.46.
//
// The Tailwind classes this file does check are reliable precisely because those
// elements sit on the app's two real surfaces. An inline colour usually travels
// with its own background, so the surface has to be read from context, and a
// guard that guesses wrong 8 times out of 8 teaches people to ignore it.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// The two backgrounds text sits on. Input fields (#252525) are excluded on
// purpose: nothing renders body text directly on them, and holding every colour
// to the darkest possible surface would fail colours that are fine where they
// are actually used.
const SURFACES = { page: '#0D0D0D', card: '#1A1A1A' };
const AA_NORMAL_TEXT = 4.5;

const channel = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });

function textColours() {
  const found = new Map();
  for (const file of walk(join(root, 'src'))) {
    const src = readFileSync(file, 'utf8');
    // `text-[#fff]` only. Deliberately not bg-, border-, from-, to- or ring-:
    // those are non-text and answer to a 3:1 bar, not 4.5:1.
    for (const m of src.matchAll(/(?<!hover:)(?<!focus:)(?<!active:)(?<!group-hover:)text-\[(#[0-9A-Fa-f]{6})\]/g)) {
      const hex = m[1].toUpperCase();
      if (!found.has(hex)) found.set(hex, []);
      // relative(), not slice(): `root` already ends in a separator, so an
      // off-by-one here silently chopped the "s" off "src/" in every reported
      // path.
      found.get(hex).push(relative(root, file).replace(/\\/g, '/'));
    }
  }
  return found;
}

test('the audit can see the app', () => {
  const colours = textColours();
  assert.ok(colours.size >= 5, `only found ${colours.size} text colours; the scan is probably broken`);
});

test('every text colour clears 4.5:1 on both surfaces', () => {
  const failures = [];
  for (const [hex, files] of textColours()) {
    for (const [name, bg] of Object.entries(SURFACES)) {
      const ratio = contrast(hex, bg);
      if (ratio < AA_NORMAL_TEXT) {
        failures.push(
          `${hex} on ${name} (${bg}) = ${ratio.toFixed(2)}:1, needs ${AA_NORMAL_TEXT}:1 — ` +
            `${files.length} use(s), e.g. ${files[0]}`,
        );
      }
    }
  }
  assert.deepEqual(failures, [], `\n  ${failures.join('\n  ')}\n`);
});

test('the three colours that failed have not come back', () => {
  // Named explicitly as well as measured, because these are the ones a
  // copy-paste from an older file would reintroduce, and the message above is
  // more useful when it can say what to use instead.
  const all = [...textColours().keys()];
  assert.ok(!all.includes('#6B7280'), '#6B7280 is back as text; use #9CA3AF (7.66 / 6.86)');
  assert.ok(!all.includes('#71717A'), '#71717A is back as text; use #9CA3AF (7.66 / 6.86)');
  assert.ok(!all.includes('#C62828'), '#C62828 is back as text; use #EF4444 (5.16 / 4.62). It stays fine as a fill or border.');
});

test('the brand red is still the brand, as a fill', () => {
  // The point of the change was readability, not repainting the app. If these
  // went to zero somebody swapped the brand out wholesale.
  let fills = 0;
  for (const file of walk(join(root, 'src'))) {
    const src = readFileSync(file, 'utf8');
    fills += (src.match(/(?:bg|border)-\[#C62828\]/g) ?? []).length;
  }
  assert.ok(fills > 40, `only ${fills} #C62828 fills/borders left; the brand colour should not have been removed`);
});
