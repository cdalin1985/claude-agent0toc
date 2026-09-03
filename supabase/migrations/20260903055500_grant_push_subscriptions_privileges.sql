-- push_subscriptions was dropped and recreated by 20260322190050 without
-- re-granting table privileges. RLS policies are only ever consulted after
-- Postgres' base GRANT check passes, so with no GRANT at all, every role --
-- authenticated (the app), service_role (send-test-push, send-match-reminder)
-- and anon -- gets "permission denied for table push_subscriptions" outright.
-- The client-side upsert() in usePushNotifications.ts never checks its error,
-- so this failed silently and the UI showed "subscribed" regardless.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;
