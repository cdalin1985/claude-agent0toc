import { StrictMode } from 'react';
import { initSentry, sentryRootOptions } from './lib/sentry';
import { createRoot } from 'react-dom/client';
import './index.css';
import './theme/themes.css';
import App from './App';
import { ThemeProvider } from './theme/ThemeProvider';
import { clearChunkReloadFlag } from './lib/lazyWithRetry';

initSentry();

// Service worker registration, with an update path.
//
// This used to be `register('/sw.js').catch(() => {})` and nothing else. There
// was no updatefound listener, no controllerchange listener and no call to
// reg.update() anywhere in src/ -- so an installed home-screen PWA that is never
// cold-launched kept whatever bundle it first booted with, indefinitely. That is
// how a stale client ends up calling an edge function whose contract has since
// changed, which is the failure this app has already been bitten by.
//
// Reloading on controllerchange is safe here because match state lives on the
// server: scores go through update-match-score as they are tapped, so a reload
// cannot lose a game in progress.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Installed PWAs can run for days without a navigation. Check for a new
      // version whenever the app is brought back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});

    // Fires when a new worker takes control (our worker calls skipWaiting, so
    // this follows an update). Reload once so the page and the worker agree on
    // which build they are running -- the activate handler has just dropped the
    // previous version's asset cache, and this page's remaining lazy chunks
    // point at files that no longer exist.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });

  // A successful boot means the chunks resolved, so a future chunk failure is
  // allowed to try its one reload again.
  clearChunkReloadFlag();
}

createRoot(document.getElementById('root')!, sentryRootOptions).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
