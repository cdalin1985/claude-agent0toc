// How often screens re-read data that realtime already keeps fresh.
//
// Every one of these queries is invalidated by the postgres_changes handler in
// Layout.tsx the moment the underlying table changes, so the interval is not
// what makes the app feel live -- it is what stops a client whose websocket
// quietly died from showing yesterday's ladder forever.
//
// It used to be 30 seconds everywhere, from before realtime covered these keys.
// That is ~7 requests per member per 30 seconds on the Home screen alone, paid
// by every open tab whether or not anything in the league had happened. At 66
// players with a handful of tabs open it costs nothing worth measuring; the
// arithmetic is what changes at 100.

/** Screens realtime already refreshes. A safety net for a dropped socket. */
export const BACKSTOP_POLL_MS = 120_000;

/**
 * A live scoreboard both players are watching while they play. Realtime drives
 * it; this is tighter than BACKSTOP_POLL_MS only because a stale score during
 * a race is the one place a dropped socket is immediately confusing.
 */
export const LIVE_MATCH_POLL_MS = 15_000;
