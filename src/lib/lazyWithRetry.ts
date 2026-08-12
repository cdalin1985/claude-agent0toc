import React from 'react';

/**
 * React.lazy that survives one dropped chunk fetch.
 *
 * Plain React.lazy is single-shot in a way that is easy to miss: once the
 * factory rejects, the payload latches _status = Rejected and the factory is
 * NEVER called again. Every later render rethrows the same error synchronously.
 * So the ErrorBoundary's "Try Again" button -- which only did setState -- could
 * not possibly work: it re-rendered, the lazy rethrew, the boundary caught it
 * again, and the screen never changed. In an installed home-screen PWA there is
 * no address bar and no reload gesture, so the only way out was to swipe-kill
 * the app.
 *
 * That is one dropped request on bar wifi turning into a permanently dead
 * route. Two things fix it:
 *
 *   1. Retry the import a few times before giving up. Most of these are a
 *      single failed request, not a missing file.
 *   2. If it still fails, reload ONCE. After a deploy the old chunk hashes are
 *      genuinely gone -- /assets/* is immutable and Vercel does not keep the
 *      previous build's files -- so no amount of retrying finds them, and only
 *      a fresh index.html has the new names. The reload is recorded in
 *      sessionStorage so a genuinely broken build cannot become a reload loop:
 *      the second failure falls through to the ErrorBoundary with a real
 *      message.
 */

const RELOADED_KEY = 'toc:chunk-reloaded';
const ATTEMPTS = 3;
const BASE_DELAY_MS = 350;

/** Chunk failures are reported with different wording per browser. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||   // Safari
    /ChunkLoadError/i.test(message) ||
    /Loading chunk \d+ failed/i.test(message)
  );
}

function hasReloadedAlready(): boolean {
  try {
    return sessionStorage.getItem(RELOADED_KEY) === '1';
  } catch {
    // Private mode / storage disabled. Treat as "already reloaded" so we degrade
    // to a visible error rather than risking a loop we cannot detect.
    return true;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOADED_KEY, '1');
  } catch {
    /* nothing we can do; the check above already fails closed */
  }
}

/** Called once the app is running, so a later chunk failure may reload again. */
export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOADED_KEY);
  } catch {
    /* ignore */
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function lazyWithRetry<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        return await factory();
      } catch (error) {
        lastError = error;
        if (attempt < ATTEMPTS) await wait(BASE_DELAY_MS * attempt);
      }
    }

    // Out of retries. A stale bundle asking for chunks that no longer exist is
    // the common cause, and only a fresh document fixes that.
    if (isChunkLoadError(lastError) && !hasReloadedAlready()) {
      markReloaded();
      window.location.reload();
      // Never resolves: the reload replaces this document. Returning a rejected
      // promise here would flash the error screen on the way out.
      await new Promise<never>(() => {});
    }

    throw lastError;
  });
}
