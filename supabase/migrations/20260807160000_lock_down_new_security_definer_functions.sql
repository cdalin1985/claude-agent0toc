-- Restores the invariant migration 20260517035030 established: no SECURITY
-- DEFINER function is callable by anon or authenticated.
--
-- Postgres grants EXECUTE to PUBLIC on every new function by default, so a
-- migration that only GRANTs to service_role leaves the function wide open --
-- the GRANT looks like the access control and isn't. Four functions landed that
-- way and were reachable by any logged-in player in production.
--
-- send_reminder_push is the serious one. It takes a URL and a bearer token as
-- parameters and performs an HTTP POST from inside the database. Callable by a
-- player, that is a server-side request forgery primitive with an arbitrary
-- destination and an arbitrary Authorization header.
--
-- Found by asserting the invariant against production rather than by reading
-- the migrations, which is the only reason it surfaced: every individual
-- migration looked correct.

REVOKE ALL ON FUNCTION public.send_reminder_push(boolean, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_reminder_push(boolean, text, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_reminder_push(boolean, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.check_match_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_match_reminders() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_match_reminders() TO service_role;

-- Trigger functions. They are only meaningful when fired by their trigger, but
-- an open SECURITY DEFINER function is an open door regardless of intent.
REVOKE ALL ON FUNCTION public.ensure_player_preferences() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_player_preferences() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.apply_notification_preferences() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_notification_preferences() FROM anon, authenticated;

-- player_accepts_notification stays reachable by authenticated on purpose: the
-- client asks it so the UI can explain why a notification is muted. It reads one
-- boolean for one player and writes nothing.
REVOKE ALL ON FUNCTION public.player_accepts_notification(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_accepts_notification(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.player_accepts_notification(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Two more the repo's history leaves open that production already handled
-- ---------------------------------------------------------------------------
--
-- Production is ahead of this repo, and the new blanket assertion surfaced the
-- difference: a database built from these files alone was NOT equivalent to
-- production, in a way that matters. Closing it here so the two agree.

-- Production has this revoked. The escalation guard is a trigger function; it
-- should never be directly callable.
REVOKE ALL ON FUNCTION public.guard_privilege_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_privilege_columns() FROM anon, authenticated;

-- Legacy rank-shift helper from the December 2025 schema, superseded by
-- cascade_ranking_after_win in the March 2026 rebuild. Production has already
-- dropped it; a fresh build still creates it, leaving a SECURITY DEFINER
-- function that is callable by any player AND does not pin search_path.
DROP FUNCTION IF EXISTS public.handle_rank_shift(uuid, integer, integer);
