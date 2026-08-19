// Bump CACHE_VERSION whenever caching behavior changes; old caches are
// cleaned up on activate.
const CACHE_VERSION = 'toc-v4';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

// How long a navigation waits for the network before the cached shell is shown.
// A blackholing access point does not reject, it hangs, so this is the only
// thing that turns "app never opens" into "app opens on last known state".
const NAV_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(['/']))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never intercept cross-origin requests (Supabase API, auth, etc.).
  if (url.origin !== self.location.origin) return;

  // SPA navigations: network-first so users always get fresh HTML, falling
  // back to the cached shell when offline so the app still opens at the bar.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match('/');

      const network = fetch(request).then((res) => {
        // Only a good response may become the offline shell. Without this check
        // one bad navigation during a deploy installed "502 Bad Gateway" as the
        // shell, and every later offline launch showed that error page instead
        // of the app until a successful navigation happened to replace it.
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy)).catch(() => {});
        }
        return res;
      });

      // Nothing cached yet -- we have to wait for the network however long it takes.
      if (!cached) {
        try {
          return await network;
        } catch {
          return Response.error();
        }
      }

      // Bar wifi that accepts the association and then blackholes traffic does
      // not REJECT -- it hangs to the OS timeout. The old `.catch()` fallback
      // only ran on a rejection, so a perfectly good cached shell sat unused
      // while the player stared at nothing. Race the network against a short
      // timer and show the app instead.
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS));
      const winner = await Promise.race([network.catch(() => null), timeout]);
      return winner ?? cached;
    })());
    return;
  }

  // Vite content-hashes everything under /assets/, so the filename changes
  // whenever the bytes do. Cache-first is genuinely safe there: a new build is a
  // new URL, which misses the cache and fetches fresh.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return res;
          })
      )
    );
    return;
  }

  // Everything else static is NOT content-hashed: /toclogo.png, the icons, the
  // web manifest, favicons. These keep their filenames forever, so cache-first
  // pinned them until somebody remembered to bump CACHE_VERSION by hand -- and
  // a control that depends on a person remembering is the failure mode this
  // repo keeps finding. Replace the league logo or fix the manifest and every
  // installed phone would keep the old one indefinitely, including the PWA
  // install icon and splash screen.
  //
  // Stale-while-revalidate instead: answer instantly from cache so the app
  // still opens fast at the bar, and refresh in the background so the next
  // open is current. At most one launch behind, with no version bump required.
  if (/\.(js|css|png|jpg|jpeg|svg|ico|webmanifest|json|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return res;
          })
          // Offline with nothing cached is a genuine miss; let it surface as a
          // failed request rather than resolving to undefined.
          .catch(() => cached);
        return cached ?? network;
      })
    );
  }
});

// A push payload is data from the network. Resolve any URL in it against our
// own origin and refuse anything that lands elsewhere, so a notification can
// never carry a player off-site. Returns a same-origin path, never an absolute
// URL, because that is all the app ever needs to navigate to.
function safePath(raw) {
  if (typeof raw !== 'string' || raw === '') return '/';
  try {
    const resolved = new URL(raw, self.location.origin);
    if (resolved.origin !== self.location.origin) return '/';
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return '/';
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  // A malformed or non-JSON payload must still produce a notification rather
  // than throwing inside the handler and dropping it silently.
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = {};
  }

  const url = safePath(data.url);
  // Tags collapse notifications: same tag replaces, rather than stacks. The old
  // fixed 'toc' tag meant a player with three pending challenges saw only the
  // last one. Collapsing is now opt-in via an explicit tag from the server;
  // the default is unique, so every notification survives.
  const tag = typeof data.tag === 'string' && data.tag
    ? data.tag
    : `toc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Top of the Capital', {
      body: data.body ?? '',
      icon: '/toc-icon.svg',
      badge: '/toc-icon.svg',
      data: { url },
      tag,
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Re-validated rather than trusted: this data was stored by the push
      // handler, but the check is cheap and this is the line that navigates.
      const url = safePath(event.notification.data?.url);
      for (const client of list) {
        // startsWith, not includes: 'evil.test/?x=https://toc.app' contains our
        // origin without being it.
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
