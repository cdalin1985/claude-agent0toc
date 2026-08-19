// The two blocking overlays behaved like decorative <div>s.
//
// SideMenu (z-50, full-height drawer with a backdrop) and OnboardingTour
// (z-60, fixed inset-0 over an 80%-black blur, and the first thing a new member
// ever sees) both rendered with no role, no aria-modal, no Escape handler and
// no focus management at all. In practice:
//
//   - opening either left focus behind it, so the first Tab walked through
//     controls hidden underneath the overlay
//   - neither could be dismissed from the keyboard
//   - screen readers still read the whole page behind them, because nothing
//     marked the rest of the document inert
//   - closing dropped focus to the top of the document, losing the user's place
//
// One hook implements it for both, and for whatever overlay comes next. Three
// copies of focus management would drift the way the cooldown rule did when it
// was written three times in three languages.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p) => readFileSync(join(root, p), 'utf8');

const hook = read('src/hooks/useModalDialog.ts');
const sideMenu = read('src/components/SideMenu.tsx');
const tour = read('src/components/OnboardingTour.tsx');

const DIALOGS = [
  ['SideMenu', sideMenu, 'Main menu'],
  ['OnboardingTour', tour, 'Getting started'],
];

for (const [name, src, label] of DIALOGS) {
  test(`${name} is a real dialog`, () => {
    assert.match(src, /role="dialog"/, `${name} has no dialog role`);
    assert.match(src, /aria-modal="true"/, `${name} does not mark the page behind it inert`);
    assert.match(
      src,
      new RegExp(`aria-label="${label}"`),
      `${name} has no accessible name, so it announces only as "dialog"`,
    );
  });

  test(`${name} uses the shared focus management`, () => {
    assert.match(src, /useModalDialog\(/, `${name} does not trap focus or handle Escape`);
    assert.match(
      src,
      /import \{ useModalDialog \} from/,
      `${name} calls useModalDialog without importing it — tsc -b catches this, tsc --noEmit does not`,
    );
  });
}

test('the hook closes on Escape', () => {
  assert.match(hook, /e\.key === 'Escape'/);
  assert.match(hook, /onClose\(\)/);
});

test('the hook traps Tab in both directions', () => {
  assert.match(hook, /e\.key !== 'Tab'/);
  assert.match(hook, /e\.shiftKey/, 'Shift+Tab must wrap too, or focus escapes backwards');
  assert.match(hook, /preventDefault/);
});

test('the hook recomputes focusable children on every Tab', () => {
  // These dialogs render conditionally: the tour swaps its whole body between
  // steps. A list captured once at open would leave new controls unreachable
  // and let focus land on removed ones.
  const trap = hook.slice(hook.indexOf("e.key !== 'Tab'"));
  assert.match(trap, /focusables\(\)/, 'the trap must call focusables() per keypress, not reuse a captured list');
});

test('the hook gives focus back when the dialog closes', () => {
  assert.match(hook, /restoreTo/, 'nothing remembers where focus came from');
  assert.match(hook, /document\.body\.contains\(target\)/, 'focus must not be restored to a detached node');
});

test('package.json exposes the typecheck that actually checks', () => {
  // The root tsconfig is `"files": []` plus project references, so a bare
  // `tsc --noEmit` resolves zero files and exits 0 no matter what is broken.
  // It reported "clean" over a genuine TS2304 in OnboardingTour. `tsc -b`
  // follows the references and catches it.
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.typecheck, 'tsc -b', 'npm run typecheck must use tsc -b, not a bare tsc');
  assert.match(pkg.scripts.build, /tsc -b/, 'the build must typecheck through the project references');
});
