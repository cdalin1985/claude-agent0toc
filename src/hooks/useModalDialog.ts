import { useEffect, useRef } from 'react';

/**
 * Makes an overlay behave like a real modal dialog for keyboard and screen
 * reader users.
 *
 * Nothing in this app did any of it. The side menu, the onboarding tour and the
 * install banner were all plain <div>s with an isOpen prop: no role, no
 * aria-modal, no Escape handler, no focus management. In practice that meant:
 *
 *   - opening the menu left focus behind it, so the first Tab moved through
 *     links the user could not see, underneath the overlay
 *   - there was no way to dismiss it from the keyboard at all; the only exits
 *     were clicking the backdrop or picking a destination
 *   - a screen reader still read the whole page behind it, because nothing told
 *     it the rest of the document had gone inert
 *   - closing it dropped focus to the top of the document, so a player who
 *     opened the menu and changed their mind lost their place entirely
 *
 * Returns a ref to attach to the dialog element. Attach it together with
 * role="dialog", aria-modal="true" and an accessible name.
 *
 * aria-modal is what hides the background from assistive tech, rather than
 * setting aria-hidden on the app root by hand. The manual approach has to be
 * undone exactly, from every exit path, and leaves the entire app unreadable if
 * one of them is ever missed.
 */
export function useModalDialog(isOpen: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement | null>(null);
  // Where focus was before we took it, so it can be handed back.
  const restoreTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    restoreTo.current = document.activeElement;
    const dialog = ref.current;

    // Focus the first thing inside, or the dialog itself if it is empty of
    // controls. Without this the screen reader stays wherever it was and never
    // learns the dialog opened.
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const first = focusables()[0];
    (first ?? dialog)?.focus?.();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Trap. The list is recomputed on every Tab rather than captured once,
      // because these dialogs render their contents conditionally -- an item
      // that appears after open would otherwise be unreachable, and one that
      // disappears would swallow focus.
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === firstItem || active === dialog)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Hand focus back to whatever opened this, but only if focus is still
      // somewhere inside the dialog. If the user has already clicked elsewhere,
      // yanking them back is worse than leaving them be.
      const target = restoreTo.current;
      if (
        target instanceof HTMLElement &&
        document.body.contains(target) &&
        (!document.activeElement || document.activeElement === document.body || dialog?.contains(document.activeElement))
      ) {
        target.focus();
      }
    };
  }, [isOpen, onClose]);

  return ref;
}
