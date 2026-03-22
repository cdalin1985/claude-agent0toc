import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: { user } } = await supabase.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', ''));
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Admin access required.' }), { status: 403, headers: cors });
    }

    const { full_name } = await req.json();
    if (!full_name?.trim()) return new Response(JSON.stringify({ error: 'full_name is required.' }), { headers: cors });

    // Insert player
    const { data: player, error: playerErr } = await supabase
      .from('players')
      .insert({ full_name: full_name.trim(), is_active: true })
      .select()
      .single();
    if (playerErr || !player) {
      return new Response(JSON.stringify({ error: playerErr?.message ?? 'Failed to create player.' }), { headers: cors });
    }

    // Get next ranking position (bottom of list)
    const { count } = await supabase.from('rankings').select('*', { count: 'exact', head: true });
    const position = (count ?? 0) + 1;

    // Seed all required rows
    await Promise.all([
      supabase.from('rankings').insert({ player_id: player.id, position }),
      supabase.from('player_season_stats').insert({ player_id: player.id }),
      supabase.from('player_discipline_stats').insert([
        { player_id: player.id, discipline: '8 Ball' },
        { player_id: player.id, discipline: '9 Ball' },
        { player_id: player.id, discipline: '10 Ball' },
      ]),
    ]);

    return new Response(JSON.stringify({ success: true, player }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
