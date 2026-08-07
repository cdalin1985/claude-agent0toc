import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPush } from '../_shared/sendPush.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function is invoked by the pg_cron-triggered send_reminder_push()
// Postgres function via pg_net. It authenticates with the service role key
// (passed as the Authorization Bearer by pg_net), NOT user credentials —
// because there is no user session in a cron context.
//
// It also accepts admin/super_admin user sessions for manual testing.
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
    let isAuthorized = !!authHeader && authHeader === serviceKey;

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

    await sendPush(supabase, notif.player_id, notif.title ?? 'Match reminder', notif.body ?? '', pushUrl);

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});