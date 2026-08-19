// The service worker pinned unhashed static files in cache forever.
//
// Cache-first was applied to every static file, on the stated reasoning that
// "build assets are content-hashed, so cache-first is safe". That is true for
// /assets/, where Vite puts the content hash in the filename: a new build is a
// new URL, so it misses the cache and fetches fresh.
//
// It is not true for anything in public/. /toclogo.png, the icons, the web
// manifest and the favicons keep the same name forever, so cache-first pinned
// them until somebody remembered to bump CACHE_VERSION by hand. Replace the
// league logo or correct the manifest and every installed phone keeps the old
// one indefinitely -- including the PWA install icon and the splash screen.
//
// A control that depends on a person remembering is the failure this repo has
// spent its whole hardening effort removing. Stale-while-revalidate needs no
// version bump: the cached copy answers instantly so the app still opens fast on
// bar wifi, and the network refresh lands in time for the next launch.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');

const ASSETS_COND = "url.pathname.startsWith('/assets/')";
const STATIC_COND_RE = /\/\\\.\(js\|css\|png/;

test('content-hashed build assets stay cache-first', () => {
  // Safe precisely because the filename changes with the bytes. Losing this
  // would cost real speed on bar wifi for no correctness gain.
  assert.ok(sw.includes(ASSETS_COND), 'the /assets/ cache-first branch is gone');
});

test('unhashed static files are revalidated, not pinned forever', () => {
  const assetsIdx = sw.indexOf(ASSETS_COND);
  const staticIdx = sw.search(STATIC_COND_RE);
  assert.ok(staticIdx !== -1, 'the static-file branch is gone');
  assert.ok(
    assetsIdx < staticIdx,
    'the hashed-asset branch must come first, or /assets/ falls into the revalidating branch',
  );

  // Stale-while-revalidate: the cached copy is returned AND the network is
  // still asked, so the next launch is current. Reverting either half puts the
  // logo and manifest back behind a manual CACHE_VERSION bump.
  const staticBranch = sw.slice(staticIdx);
  assert.match(
    staticBranch,
    /cached \?\? network/,
    'the static branch must answer from cache when it has one',
  );
  assert.match(
    staticBranch,
    /cache\.put\(request, copy\)/,
    'the static branch must refresh the cache in the background, or it is just cache-first again',
  );
});

test('the hashed-asset branch returns, so it cannot fall through', () => {
  // Without the early return an /assets/ request matches the second condition
  // too, and respondWith is called twice on one event -- an InvalidStateError
  // that breaks asset loading outright. Verified to fail: restoring the original
  // single combined condition trips this assertion.
  const branch = sw.slice(sw.indexOf(ASSETS_COND));
  const beforeStatic = branch.slice(0, branch.search(STATIC_COND_RE));
  // \r?\n, not \n. git normalises this file to CRLF on a Windows checkout, and
  // a bare \n silently stops matching -- which is how this assertion first
  // failed against a sw.js that was entirely correct.
  assert.match(
    beforeStatic,
    /\r?\n\s*return;\r?\n/,
    'the /assets/ branch must end in `return;`',
  );
});

test('CACHE_VERSION was bumped for the behaviour change', () => {
  // The file's own first line says to bump it whenever caching behaviour
  // changes, and old caches are dropped on activate. Without the bump, phones
  // holding a toc-v3 cache keep serving the pinned copies this change exists to
  // release.
  assert.match(sw, /const CACHE_VERSION = 'toc-v[4-9]/, 'CACHE_VERSION must be past toc-v3');
});
