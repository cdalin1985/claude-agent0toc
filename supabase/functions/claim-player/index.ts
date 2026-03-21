import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify auth
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { player_id } = await req.json();
    if (!player_id) return new Response(JSON.stringify({ error: 'player_id required' }), { headers: corsHeaders });

    // Check user hasn't already claimed
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (existingPlayer) return new Response(JSON.stringify({ error: 'You have already claimed a player profile.' }), { headers: corsHeaders });

    // Check target player is unclaimed
    const { data: targetPlayer } = await supabase
      .from('players')
      .select('id, profile_id, full_name')
      .eq('id', player_id)
      .single();
    if (!targetPlayer) return new Response(JSON.stringify({ error: 'Player not found.' }), { headers: corsHeaders });
    if (targetPlayer.profile_id) return new Response(JSON.stringify({ error: 'This player has already been claimed.' }), { headers: corsHeaders });

    // Claim it
    await supabase.from('players').update({ profile_id: user.id }).eq('id', player_id);

    // Log audit event
    await supabase.from('audit_events').insert({
      actor_profile_id: user.id,
      action: 'claim_player',
      target_type: 'player',
      target_id: player_id,
      detail: { player_name: targetPlayer.full_name },
    });

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
