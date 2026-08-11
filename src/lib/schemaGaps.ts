/**
 * Tolerating a database that is behind the app.
 *
 * The frontend and the migrations deploy through different pipelines: Vercel
 * builds the moment main moves, and migrations are applied by a separate
 * workflow. Whichever wins the race, there is a window where the app asks for a
 * table or column that does not exist yet — and on 2026-08-10 that window
 * broke profile editing on the live site, because one widened `select` 400'd
 * and took bio and preferred discipline down with it.
 *
 * So a missing schema object is treated as "this feature is not available yet",
 * not as an error. An optional feature's table being absent must never break a
 * page that does not depend on it. Everything lights up on its own once the
 * migration lands — no second deploy, no cache to clear.
 *
 * This is deliberately permanent rather than a temporary shim: the deploy race
 * is structural, and it will recur every time the two pipelines disagree.
 */

type MaybePostgrestError = { code?: string; message?: string } | null | undefined;

/**
 * PostgREST reports a missing table as PGRST205 and a missing column as
 * PGRST204; Postgres itself uses 42P01 and 42703. A widened `select` naming an
 * absent column comes back as a 400 whose message names it, so the message is
 * checked too.
 */
export function isMissingSchemaObject(error: MaybePostgrestError): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (['PGRST205', 'PGRST204', '42P01', '42703'].includes(code)) return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('schema cache')
  );
}

/**
 * Narrows an update payload to the columns a previously-loaded row actually
 * has, so writing a field the database does not know about is impossible.
 *
 * `reference` is the row as the database returned it (via `select('*')`), which
 * is the only trustworthy statement of what exists.
 */
export function onlyExistingColumns<T extends Record<string, unknown>>(
  payload: T,
  reference: Record<string, unknown> | null | undefined,
): Partial<T> {
  if (!reference) return payload;
  const allowed = new Set(Object.keys(reference));
  const narrowed: Partial<T> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (allowed.has(key)) narrowed[key as keyof T] = value as T[keyof T];
  }
  return narrowed;
}
