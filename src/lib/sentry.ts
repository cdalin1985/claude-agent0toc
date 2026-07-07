import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/**
 * Initialize Sentry error monitoring.
 * No-ops when VITE_SENTRY_DSN is not set (local dev, preview builds),
 * so the app never depends on Sentry being configured.
 */
export function initSentry(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  });
}

/**
 * React 19 root options that report render errors to Sentry.
 * Safe to pass even when Sentry is not initialized.
 */
export const sentryRootOptions = {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
};
