// Decide whether an error string is fit to show a member.
//
// Most error surfaces in this app already wrap the raw message in a sentence
// ("Could not save: ..."), which is right when the message says something. The
// problem is the messages that do not. Three kinds reach a member and none of
// them help:
//
//   - Browser network failures. "Failed to fetch" (Chrome), "Load failed"
//     (Safari), "NetworkError when attempting to fetch resource" (Firefox).
//     Pasted after "Couldn't save your profile:" this reads as though the
//     profile was rejected, when the request never arrived.
//   - Postgres errors, which carry constraint, column and table names. Edge
//     functions already log the real one and return something else; direct
//     PostgREST calls from the browser do not, so they land here.
//   - Supabase Storage's internal shapes, e.g. "new row violates row-level
//     security policy" for what a member experiences as "the upload was
//     refused".
//
// Anything genuinely readable passes through unchanged -- "Email rate limit
// exceeded" is more useful than any generic sentence could be, and replacing it
// would be its own kind of lying.

const UNHELPFUL = [
  // Network-layer failures, in each engine's wording.
  /failed to fetch/i,
  /load failed/i,
  /network\s?error/i,
  /network request failed/i,
  /fetch failed/i,
  /err_[a-z_]+/i,
  /timed? ?out/i,
  /aborted/i,
  // Postgres and PostgREST internals.
  /violates .*constraint/i,
  /violates row-level security/i,
  /duplicate key value/i,
  /permission denied for/i,
  /relation ".*" does not exist/i,
  /column ".*" does not exist/i,
  /^pgrst/i,
  /jwt/i,
];

/**
 * `raw` if a member could act on it, `fallback` otherwise.
 * The fallback should say what happened and what to do about it.
 */
export function humanError(raw: string | null | undefined, fallback: string): string {
  const message = raw?.trim();
  if (!message) return fallback;
  if (UNHELPFUL.some((pattern) => pattern.test(message))) return fallback;
  return message;
}

/**
 * A whole sentence for a failed action.
 *
 * `${prefix}: ${raw}` when the raw message adds something, and a self-contained
 * sentence when it does not. Prefixing unconditionally is what produced
 * "Couldn't save your profile: Failed to fetch" — a sentence that blames the
 * profile for a dropped request, and leaves the member with nothing to try.
 */
export function failureMessage(prefix: string, raw?: string | null): string {
  const usable = humanError(raw, '');
  return usable
    ? `${prefix}: ${usable}`
    : `${prefix} — the app couldn't reach the league. Check your connection and try again.`;
}
