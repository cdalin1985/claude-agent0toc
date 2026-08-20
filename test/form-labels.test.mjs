// 29 of 33 form controls had no accessible name.
//
// Every text box, dropdown and textarea in the app relied on either a
// placeholder or a visible <label> that was never associated with it. Of the 15
// <label> elements in the codebase, exactly 2 used htmlFor. A screen reader
// announced the rest as "edit text, blank" -- including the admin flows that add
// players to the ladder and record money into the treasury.
//
// A placeholder is not a label. It disappears the moment the field is focused,
// which is exactly when someone filling in a form needs it, and it is not a
// reliable accessible name. WCAG 3.3.2 and 4.1.2.
//
// The name each control got, in order of preference:
//   1. an explicit name, where none could be derived
//   2. the nearest visible <label> -- that IS the field's name
//   3. the placeholder, where that was all there was
//
// AdminPage's SettingsField was the satisfying one: a single aria-label={label}
// on the shared component named every field it renders.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const walk = (d) =>
  readdirSync(d).flatMap((e) => {
    const p = join(d, e);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });

// A naive /<input[\s\S]*?>/ stops at the first ">" it finds, and an arrow
// function in a prop -- onKeyDown={(e) => ...} -- contains one. That truncates
// the tag mid-attribute and hides everything after it. The first version of this
// scan did exactly that and reported a field with both a placeholder and an id
// as having neither. Track brace and quote depth instead.
function openingTag(src, start) {
  let i = start;
  let depth = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return src.slice(start, i + 1);
    i += 1;
  }
  return src.slice(start);
}

function unnamedControls() {
  const out = [];
  let scanned = 0;
  for (const file of walk(join(root, 'src'))) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(root, file).split('\\').join('/');
    for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
      const tag = openingTag(src, m.index);
      if (/type="(hidden|submit|button)"/.test(tag)) continue;
      // display:none removes a control from the accessibility tree entirely, so
      // it is neither focusable nor announced. The two file inputs behind the
      // avatar and banner upload buttons are this: real controls, driven by a
      // ref from a visible button, never reached directly.
      if (/className="hidden"/.test(tag)) continue;
      scanned += 1;
      if (/aria-label=|aria-labelledby=|\bid=|\btitle=/.test(tag)) continue;
      out.push(`${rel}:${src.slice(0, m.index).split('\n').length} <${m[1]}>`);
    }
  }
  return { out, scanned };
}

test('the scan sees the app', () => {
  const { scanned } = unnamedControls();
  assert.ok(scanned >= 25, `only ${scanned} form controls found; this guard would pass vacuously`);
});

test('every form control has an accessible name', () => {
  const { out } = unnamedControls();
  assert.deepEqual(
    out,
    [],
    '\n  These announce as "edit text, blank". A placeholder does not count -- it\n' +
      '  disappears on focus:\n    ' +
      out.join('\n    ') +
      '\n',
  );
});

test('a visible label wins over a placeholder', () => {
  // Where a field had both, the label is the name and the placeholder is the
  // hint. Getting this backwards would name the Bio field "A few words about
  // your game…", which is guidance, not identity.
  const settings = readFileSync(join(root, 'src/pages/SettingsPage.tsx'), 'utf8');
  for (const name of ['Display Name', 'Bio', 'Nickname', 'Tagline', 'Home Venue', 'Years Playing', 'Cue']) {
    assert.match(settings, new RegExp(`aria-label="${name}"`), `${name} lost its label-derived name`);
  }
});

test('the shared settings field names itself from its own label', () => {
  // One aria-label on the shared component covers every field it renders, and
  // cannot drift from the visible text the way copies would.
  const admin = readFileSync(join(root, 'src/pages/AdminPage.tsx'), 'utf8');
  assert.match(admin, /aria-label=\{label\}/, 'SettingsField no longer names its input from its label prop');
});
