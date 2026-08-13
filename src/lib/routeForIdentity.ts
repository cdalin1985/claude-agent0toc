import type { IdentityStatus } from '../stores/authStore';

// Where a signed-in visitor belongs, given what we currently know about them.
//
// This lived inside a useEffect in Layout, which made it impossible to test and
// easy to get wrong -- and it was wrong. It read a null `player` as "has not
// claimed a profile", when null also meant "the read failed and we have no
// idea". A single dropped request therefore sent a member who claimed their
// profile weeks ago to the Claim screen, where their name no longer appears
// because they already took it. Nothing on that screen could help them.
//
// The rule that fixes it: never route on identity until identity is resolved.
// An unresolved answer is not an answer.

export const PUBLIC_PATHS = ['/login', '/auth/callback'];

export interface IdentityRoutingState {
  path: string;
  hasSession: boolean;
  hasPlayer: boolean;
  identityStatus: IdentityStatus;
}

/** The path to redirect to, or null to stay where we are. */
export function routeForIdentity({
  path,
  hasSession,
  hasPlayer,
  identityStatus,
}: IdentityRoutingState): string | null {
  if (PUBLIC_PATHS.includes(path)) return null;

  if (!hasSession) return '/login';

  // 'unknown' (still asking) and 'failed' (asked, no answer) both mean we do
  // not know. Guessing in either case is what broke this.
  if (identityStatus !== 'resolved') return null;

  if (!hasPlayer && path !== '/claim') return '/claim';
  if (hasPlayer && path === '/claim') return '/';

  return null;
}
