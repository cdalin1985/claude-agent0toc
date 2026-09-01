-- send_reminder_push() (20260901051156_send_push_cannot_break_the_reminder.sql)
-- calls net.http_post to deliver match-reminder pushes. Without this
-- extension the p_pg_net guard is false and every push is a silent no-op.

CREATE EXTENSION IF NOT EXISTS pg_net;
