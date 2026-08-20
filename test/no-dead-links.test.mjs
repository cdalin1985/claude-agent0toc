// Internal links that point at routes which do not exist.
//
// The side menu's "Profile" item, and the profile card above it, both navigated
// to /profile. App.tsx has never declared that route, so both fell straight
// through to `<Route path="*" element={<Navigate to="/" replace />} />` and
// silently redirected Home. Two dead links in the primary navigation, and
// nothing anywhere said so -- the catch-all is designed to swallow exactly this,
// which is what made it invisible.
//
// So this does not test that /profile is fixed. It reads every declared route
// out of App.tsx, collects every internal destination in the app, and asserts
// each one lands somewhere real. A dead link added next month fails here.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const walk = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : [];
  });

const appTsx = readFileSync(join(root, 'src/App.tsx'), 'utf8');

const declaredRoutes = [...appTsx.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => p !== '*');

// "/player/:id" matches "/player/anything-without-a-slash".
const routeMatchers = declaredRoutes.map((route) => ({
  route,
  re: new RegExp('^' + route.replace(/:[A-Za-z]+/g, '[^/]+').replace(/\//g, '\\/') + '$'),
}));

const isDeclared = (path) => routeMatchers.some(({ re }) => re.test(path));

function internalDestinations() {
  const hits = [];
  for (const file of walk(join(root, 'src'))) {
    if (file.endsWith('App.tsx')) continue; // the route table itself
    const src = readFileSync(file, 'utf8');
    const where = relative(root, file).replace(/\\/g, '/');

    // Deliberately broad. The first version of this file only matched
    // `navigate('/x')`, and so would NOT have caught the bug it was written
    // for: the dead /profile link reached the router through
    // `handleNavigate('/profile')` and through a `path:` field in a menu array,
    // neither of which that pattern sees. A guard that misses its own
    // motivating case is worse than none, because it reads as coverage.
    const patterns = [
      /[a-zA-Z]*avigate\(\s*[`'"]([^`'"]+)[`'"]/g, // navigate(...) and handleNavigate(...)
      /\bto=\{?\s*[`'"]([^`'"]+)[`'"]/g,           // <Link to="/x">
      /\bhref="([^"]+)"/g,                         // <a href="/x">
      /\bpath:\s*[`'"](\/[^`'"]*)[`'"]/g,          // { path: '/x' } in nav tables
    ];
    for (const re of patterns) {
      for (const m of src.matchAll(re)) hits.push({ path: m[1], where });
    }
  }
  return hits;
}

// Things that are legitimately not app routes.
const skip = (p) =>
  p === '' ||
  p.startsWith('#') ||          // in-page anchors and deliberate sentinels
  p.startsWith('mailto:') ||
  p.startsWith('tel:') ||
  p.startsWith('http://') ||
  p.startsWith('https://') ||
  p.startsWith('//') ||
  p.startsWith('..') ||
  !p.startsWith('/');           // relative asset paths, query fragments

test('the route table is readable', () => {
  assert.ok(
    declaredRoutes.length >= 15,
    `only ${declaredRoutes.length} routes parsed from App.tsx; this guard would pass vacuously`,
  );
});

test('every internal link points at a route that exists', () => {
  const dead = [];
  for (const { path, where } of internalDestinations()) {
    if (skip(path)) continue;
    // React Router matches on the pathname alone, so a query string or hash is
    // not part of the route. Without stripping them, four perfectly good links
    // to /rankings?challenge=1 were reported as dead.
    const pathname = path.split(/[?#]/)[0];
    // `/player/${player.id}` arrives here as "/player/" once the template hole
    // is stripped by the capture; treat a trailing slash as the param.
    const concrete = pathname.endsWith('/') && pathname !== '/' ? `${pathname}x` : pathname;
    if (!isDeclared(concrete)) dead.push(`${path}   (${where})`);
  }
  assert.deepEqual(
    dead,
    [],
    '\n  These go nowhere. The catch-all route swallows them and redirects Home, so they fail silently:\n    ' +
      dead.join('\n    ') +
      '\n  Declared routes: ' +
      declaredRoutes.join(' ') +
      '\n',
  );
});

test('the catch-all is still there to absorb genuinely bad URLs', () => {
  // The guard above only matters because unknown paths do not 404 -- they
  // redirect. If someone removes this, dead links become blank screens instead.
  assert.match(appTsx, /path="\*"/, 'the catch-all route is gone');
});
