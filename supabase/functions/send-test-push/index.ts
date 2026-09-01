import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Send a push to YOUR OWN device and say plainly what happened.
//
// Everything from pg_cron to this runtime is verifiable from a SQL prompt. The
// last hop -- VAPID signing to a real handset -- is not: sendPush() checks for a
// subscription before it ever touches the VAPID keys, so with nobody subscribed
// that code path cannot be reached by any probe, and a mismatched key pair would
// stay invisible until the first real match reminder failed to arrive.
//
// The production sendPush() is deliberately silent: a failed push must never
// break the challenge or result that triggered it, so it swallows everything to
// the log. Correct there, useless for finding out whether push works at all.
// This endpoint is the opposite -- it exists only to report, and it returns the
// specific reason rather than a boolean.
//
// It can only ever push to the caller's own subscription. There is no player_id
// parameter, so it cannot be used to send anything to anybody else.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { data: player } = await supabase
      .from('players').select('id, full_name').eq('profile_id', user.id).maybeSingle();
    if (!player) return json({ error: 'No player profile is linked to this account.' }, 404);

    // Config first, so "you never subscribed" is never reported when the real
    // problem is that the server was never configured.
    const subject = Deno.env.get('VAPID_SUBJECT') ?? '';
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
    const missing = [
      subject ? null : 'VAPID_SUBJECT',
      publicKey ? null : 'VAPID_PUBLIC_KEY',
      privateKey ? null : 'VAPID_PRIVATE_KEY',
    ].filter((n): n is string => n !== null);

    if (missing.length > 0) {
      return json({
        ok: false,
        reason: 'not_configured',
        message: `Push is not configured on the server (missing ${missing.join(', ')}). Nobody will receive reminders until an admin sets these.`,
      });
    }

    const { data: row, error: subErr } = await supabase
      .from('push_subscriptions').select('subscription').eq('player_id', player.id).maybeSingle();
    if (subErr) {
      return json({ ok: false, reason: 'lookup_failed', message: 'Could not read your notification settings. Try again.' });
    }
    if (!row?.subscription) {
      return json({
        ok: false,
        reason: 'no_subscription',
        message: 'This device is not subscribed yet. Turn Push Notifications on, then run the test again.',
      });
    }

    try {
      const subj = /^(mailto:|https?:)/i.test(subject) ? subject : `mailto:${subject}`;
      webpush.setVapidDetails(subj, publicKey, privateKey);
      await webpush.sendNotification(
        row.subscription,
        JSON.stringify({
          title: '🎱 TOC test notification',
          body: 'Push is working. Match reminders will reach this device.',
          url: '/settings',
        }),
      );
      return json({ ok: true, message: 'Sent. It should appear on this device within a few seconds.' });
    } catch (e) {
      const err = e as { statusCode?: number; body?: string; message?: string };

      // 403 from the push service means the JWT was signed with a private key
      // that does not match the public key the browser subscribed with. This is
      // the failure that is invisible until a real reminder is due, and the
      // reason this endpoint exists.
      if (err.statusCode === 403) {
        console.error(`[test-push] VAPID rejected for player ${player.id}: ${err.body ?? err.message}`);
        return json({
          ok: false,
          reason: 'vapid_mismatch',
          message: 'The server\'s VAPID keys do not match the one this browser subscribed with. An admin needs to re-set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY as a matching pair, then everyone must re-enable notifications.',
        });
      }

      // The browser threw this subscription away. Drop it so the next attempt
      // creates a fresh one instead of failing forever.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('player_id', player.id);
        return json({
          ok: false,
          reason: 'subscription_expired',
          message: 'This device\'s subscription had expired, so it has been cleared. Turn Push Notifications off and on again.',
        });
      }

      console.error(`[test-push] failed for player ${player.id} (status ${err.statusCode ?? 'none'}): ${err.body ?? err.message}`);
      return json({
        ok: false,
        reason: 'delivery_failed',
        message: `The push service refused it${err.statusCode ? ` (status ${err.statusCode})` : ''}. This is usually temporary — try again in a minute.`,
      });
    }
  } catch (e) {
    console.error(`[send-test-push] unhandled: ${e instanceof Error ? e.message : String(e)}`);
    return json({ error: 'Something went wrong on our end. Please try again.' }, 500);
  }
});
