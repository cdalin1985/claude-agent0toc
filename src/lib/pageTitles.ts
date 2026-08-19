/**
 * Route -> human page name.
 *
 * Kept out of RouteAnnouncer.tsx so that file exports only a component (React
 * Fast Refresh requires it), and so this mapping can be tested on its own
 * without rendering anything.
 *
 * Order matters: the first pattern that matches wins, so exact routes are
 * listed before prefixes they would otherwise be swallowed by.
 */
const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Home'],
  [/^\/rankings$/, 'Rankings'],
  [/^\/player\//, 'Player Profile'],
  [/^\/challenges$/, 'Challenges'],
  [/^\/challenge\//, 'Challenge'],
  [/^\/matches$/, 'Matches'],
  [/^\/match\//, 'Match'],
  [/^\/notifications$/, 'Notifications'],
  [/^\/settings$/, 'Settings'],
  [/^\/admin$/, 'Admin'],
  [/^\/treasury$/, 'Treasury'],
  [/^\/activity$/, 'League Journal'],
  [/^\/rules$/, 'Rules'],
  [/^\/login$/, 'Sign In'],
  [/^\/claim$/, 'Claim Your Profile'],
  [/^\/auth\/callback$/, 'Signing In'],
];

export const TITLE_SUFFIX = 'Top of the Capital';

/** The page's name, or null for a route with no entry. */
export function pageNameFor(pathname: string): string | null {
  for (const [pattern, name] of TITLES) {
    if (pattern.test(pathname)) return name;
  }
  return null;
}

/** What belongs in document.title for this route. */
export function documentTitleFor(pathname: string): string {
  const name = pageNameFor(pathname);
  return name ? `${name} · ${TITLE_SUFFIX}` : TITLE_SUFFIX;
}
