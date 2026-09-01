import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPush } from '../_shared/sendPush.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function is invoked by the pg_cron-triggered send_reminder_push()
// Postgres function via pg_net. It authenticates as service_role — there is no
// user session in a cron context. It also accepts admin/super_admin user
// sessions for manual testing.
//
// Authorisation is by the token's ROLE CLAIM, not by string-matching a key.
//
// It used to compare the bearer against Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
// and nothing else. That broke the moment this project was migrated to the new
// API key format: the caller holds the legacy service_role JWT (verified as
// current — same issue batch as the live anon key, valid to 2035) while the
// platform injects a different value into that variable. Same project, same
// permissions, two different strings, so === was false and every cron push got
// 401. Nothing was wrong with the key.
//
// Reading the claim is safe here because verify_jwt is enabled for this
// function, which means Supabase's gateway has already checked the signature
// against the project's JWT secret before any of this code runs. A token that
// reaches us is authentic; we are only asking what it says it is. The exact
// match is kept first so a deployment where the variable does line up is
// unaffected.
//
// If verify_jwt is ever turned off for this function, the claim becomes
// caller-controlled and this check becomes forgeable — a test asserts that
// config.toml never disables it.
/**
 * True when the bearer is a Supabase-issued service_role JWT.
 *
 * Signature is NOT checked here and must not be: Supabase's gateway has already
 * done it (verify_jwt). This only decodes the payload the gateway vouched for.
 */
function isServiceRoleJwt(token: string): boolean {
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')),
    );
    return json?.role === 'service_role' && json?.iss === 'supabase';
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Auth: either service-role bearer (cron path) or admin user session (manual).
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    let isAuthorized = !!authHeader
      && (authHeader === serviceKey || isServiceRoleJwt(authHeader));

    if (!isAuthorized && authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader);
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile && ['admin', 'super_admin'].includes(profile.role)) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
    }

    const { notification_id } = await req.json();
    if (!notification_id) {
      return new Response(JSON.stringify({ error: 'notification_id is required.' }), { status: 400, headers: cors });
    }

    const { data: notif, error: notifErr } = await supabase
      .from('notifications')
      .select('player_id, type, title, body, reference_id, reference_type')
      .eq('id', notification_id)
      .single();

    if (notifErr || !notif) {
      return new Response(JSON.stringify({ error: 'Notification not found.' }), { status: 404, headers: cors });
    }

    // Only forward match-reminder notifications through this endpoint.
    if (!String(notif.type).startsWith('match_reminder')) {
      return new Response(JSON.stringify({ error: 'Not a match reminder.' }), { status: 400, headers: cors });
    }

    // Push URL lands them on the match page if we have the match id.
    const pushUrl = notif.reference_type === 'match' && notif.reference_id
      ? `/match/${notif.reference_id}`
      : '/matches';

    await sendPush(supabase, notif.player_id, notif.title ?? 'Match reminder', notif.body ?? '', pushUrl, notif.type);

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    // Postgres errors carry constraint, column and table names. Log the real
    // one for us; return something a player can act on.
    console.error(`[send-match-reminder] unhandled: ${e instanceof Error ? e.message : String(e)}`);
    return new Response(JSON.stringify({ error: 'Something went wrong on our end. Please try again.' }), { status: 500, headers: cors });
  }
});