import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { documentTitleFor, pageNameFor, TITLE_SUFFIX } from '../lib/pageTitles';

/**
 * Gives every route a real page title, and tells screen readers when the page
 * changed.
 *
 * A full page load does two things for free that client-side routing does not:
 * it sets a new document title, and it moves the screen reader into a new
 * document and announces it. React Router does neither, and nothing here was
 * filling the gap.
 *
 * What that cost:
 *
 *   - All 16 routes shared one title, "Top of the Capital — Helena Pool
 *     League". WCAG 2.4.2 (Level A) asks for a title that describes the page.
 *     It also made the browser tab useless for anyone keeping the ladder open
 *     beside their match, and turned history into a list of identical entries.
 *   - Navigating announced nothing at all. Tapping "Rankings" with a screen
 *     reader produced silence, leaving the user to go hunting for what, if
 *     anything, had changed.
 *
 * polite, not assertive: a page change should be announced after whatever the
 * user is currently hearing, never cut across it.
 */
export const RouteAnnouncer: React.FC = () => {
  const { pathname } = useLocation();
  const name = pageNameFor(pathname);

  // The title is a real side effect on the document, so it belongs in an effect.
  useEffect(() => {
    document.title = documentTitleFor(pathname);
  }, [pathname]);

  // The announcement is not state: it is a pure function of the route, so it is
  // derived during render rather than pushed into useState from the effect.
  //
  // No first-render guard is needed either. A live region announces *changes*
  // to its contents; text already present when the region enters the DOM is not
  // announced. This region ships in the initial markup, so a cold page load
  // stays silent -- the browser has already announced the document -- while
  // every client-side navigation after it is a change, which is exactly what
  // should speak.
  //
  // Announce the page, not the URL: "Rankings" is what the player asked for,
  // "/rankings" is an implementation detail they did not.
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {name ? `${name} page` : TITLE_SUFFIX}
    </div>
  );
};
