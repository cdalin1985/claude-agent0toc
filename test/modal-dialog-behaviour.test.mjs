// useModalDialog, actually exercised rather than asserted about.
//
// Every other guard in this suite reads source and checks that the right words
// are present. That is fine for "is aria-modal set", and useless for focus
// management, which is a sequence of DOM effects that can contain every correct
// token and still trap a user in a corner. This mounts a real dialog in jsdom
// and drives it with real key events.
//
// Two honest limits, stated because they change what the passes mean:
//
//   1. jsdom has no layout engine. offsetParent is null for everything, so the
//      hook's visibility filter would find zero focusable children and the trap
//      would swallow every Tab. The test defines offsetParent on the prototype
//      to declare "these elements are visible" -- which is a statement about the
//      fixture, not a claim the hook was verified against real layout.
//   2. This proves the hook. It does not prove SideMenu or OnboardingTour render
//      it correctly; modal-dialogs.test.mjs covers that they call it at all.
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });

// React reads these off globalThis at import time, so they must exist first.
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// Node 24 defines globalThis.navigator as a getter-only accessor, so a plain
// assignment throws "Cannot set property navigator". Redefine it instead.
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.requestAnimationFrame = (cb) => dom.window.setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// See limit 1 above. Without this every element reports itself as invisible.
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetParent', {
  get() {
    return this.isConnected ? this.parentNode : null;
  },
  configurable: true,
});

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { useModalDialog } = await import('../src/hooks/useModalDialog.ts');

const { document: doc } = dom.window;

function Dialog({ open, onClose, count = 3 }) {
  const ref = useModalDialog(open, onClose);
  if (!open) return null;
  return React.createElement(
    'div',
    { ref, role: 'dialog', 'aria-modal': 'true', tabIndex: -1, id: 'dlg' },
    Array.from({ length: count }, (_, i) =>
      React.createElement('button', { key: i, id: `b${i}` }, `b${i}`),
    ),
  );
}

async function mount(ui) {
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(ui));
  return {
    host,
    rerender: async (next) => act(async () => root.render(next)),
    unmount: async () => act(async () => root.unmount()),
  };
}

const press = (key, shiftKey = false) =>
  act(async () => {
    doc.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
    );
  });

test('focus moves into the dialog when it opens', async () => {
  const opener = doc.createElement('button');
  doc.body.appendChild(opener);
  opener.focus();
  assert.equal(doc.activeElement, opener);

  const m = await mount(React.createElement(Dialog, { open: true, onClose() {} }));
  assert.equal(doc.activeElement?.id, 'b0', 'the first control inside should take focus');
  await m.unmount();
  opener.remove();
});

test('Escape closes it', async () => {
  let closed = 0;
  const m = await mount(React.createElement(Dialog, { open: true, onClose: () => { closed += 1; } }));
  await press('Escape');
  assert.equal(closed, 1, 'Escape did not call onClose');
  await m.unmount();
});

test('Tab wraps from the last control back to the first', async () => {
  const m = await mount(React.createElement(Dialog, { open: true, onClose() {} }));
  doc.getElementById('b2').focus();
  await press('Tab');
  assert.equal(doc.activeElement?.id, 'b0', 'focus escaped past the end of the dialog');
  await m.unmount();
});

test('Shift+Tab wraps from the first control back to the last', async () => {
  // The half that is easy to forget: a trap that only handles forward Tab lets
  // focus walk backwards out of the dialog and under the overlay.
  const m = await mount(React.createElement(Dialog, { open: true, onClose() {} }));
  doc.getElementById('b0').focus();
  await press('Tab', true);
  assert.equal(doc.activeElement?.id, 'b2', 'focus escaped backwards out of the dialog');
  await m.unmount();
});

test('focus returns to whatever opened it', async () => {
  const opener = doc.createElement('button');
  opener.id = 'opener';
  doc.body.appendChild(opener);
  opener.focus();

  const m = await mount(React.createElement(Dialog, { open: true, onClose() {} }));
  assert.equal(doc.activeElement?.id, 'b0');
  await m.rerender(React.createElement(Dialog, { open: false, onClose() {} }));
  assert.equal(doc.activeElement?.id, 'opener', 'focus was not handed back on close');

  await m.unmount();
  opener.remove();
});

test('a control added after opening is reachable', async () => {
  // The list is recomputed per keypress rather than captured at open. The tour
  // swaps its whole body between steps, so a captured list would leave new
  // controls unreachable.
  const m = await mount(React.createElement(Dialog, { open: true, onClose() {}, count: 2 }));
  await m.rerender(React.createElement(Dialog, { open: true, onClose() {}, count: 3 }));
  doc.getElementById('b2').focus();
  await press('Tab');
  assert.equal(doc.activeElement?.id, 'b0', 'the newly added control was not in the trap');
  await m.unmount();
});

test('the listener is removed on close, so Escape stops firing', async () => {
  let closed = 0;
  const m = await mount(React.createElement(Dialog, { open: true, onClose: () => { closed += 1; } }));
  await m.rerender(React.createElement(Dialog, { open: false, onClose: () => { closed += 1; } }));
  await press('Escape');
  assert.equal(closed, 0, 'the keydown listener outlived the dialog');
  await m.unmount();
});
