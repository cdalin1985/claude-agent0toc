import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPush } from '../_shared/sendPush.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user } } = await supabase.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', ''));
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Admin access required.' }), { status: 403, headers: cors });
    }

    const { player_id, title, body, url } = await req.json();
    if (!player_id || !title) {
      return new Response(JSON.stringify({ error: 'player_id and title are required.' }), { status: 400, headers: cors });
    }

    await sendPush(supabase, player_id, title, body ?? '', url ?? '/');

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    // Postgres errors carry constraint, column and table names. Log the real
    // one for us; return something a player can act on.
    console.error(`[send-push] unhandled: ${e instanceof Error ? e.message : String(e)}`);
    return new Response(JSON.stringify({ error: 'Something went wrong on our end. Please try again.' }), { status: 500, headers: cors });
  }
});
