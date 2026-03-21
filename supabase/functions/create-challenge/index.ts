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

    const authHeader = req.headers.get('Authorization');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader?.replace('Bearer ', ''));
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { challenged_player_id, discipline, race_length } = await req.json();

    // Validate inputs
    const validDisciplines = ['8 Ball', '9 Ball', '10 Ball'];
    if (!validDisciplines.includes(discipline)) return new Response(JSON.stringify({ error: 'Invalid discipline.' }), { headers: corsHeaders });
    if (!Number.isInteger(race_length) || race_length < 5 || race_length > 15) return new Response(JSON.stringify({ error: 'Race length must be 5-15.' }), { headers: corsHeaders });

    // Get challenger player
    const { data: challenger } = await supabase.from('players').select('id, is_active').eq('profile_id', user.id).single();
    if (!challenger) return new Response(JSON.stringify({ error: 'You must claim a player profile first.' }), { headers: corsHeaders });
    if (!challenger.is_active) return new Response(JSON.stringify({ error: 'Your account is inactive.' }), { headers: corsHeaders });
    if (challenger.id === challenged_player_id) return new Response(JSON.stringify({ error: 'You cannot challenge yourself.' }), { headers: corsHeaders });

    // Get challenged player
    const { data: challenged } = await supabase.from('players').select('id, is_active').eq('id', challenged_player_id).single();
    if (!challenged || !challenged.is_active) return new Response(JSON.stringify({ error: 'That player is not active.' }), { headers: corsHeaders });

    // Check rank difference
    const [challengerRank, challengedRank] = await Promise.all([
      supabase.from('rankings').select('position').eq('player_id', challenger.id).single(),
      supabase.from('rankings').select('position').eq('player_id', challenged_player_id).single(),
    ]);
    if (!challengerRank.data || !challengedRank.data) return new Response(JSON.stringify({ error: 'Could not retrieve rankings.' }), { headers: corsHeaders });
    if (Math.abs(challengerRank.data.position - challengedRank.data.position) > 5) {
      return new Response(JSON.stringify({ error: 'You can only challenge players within ±5 of your rank.' }), { headers: corsHeaders });
    }

    // Check cooldown
    const { data: cooldown } = await supabase
      .from('cooldowns')
      .select('id')
      .eq('player_id', challenger.id)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (cooldown) return new Response(JSON.stringify({ error: 'You are in a cooldown period.' }), { headers: corsHeaders });

    // Check no active outgoing challenge
    const { data: existingOut } = await supabase
      .from('challenges')
      .select('id')
      .eq('challenger_id', challenger.id)
      .eq('status', 'pending')
      .single();
    if (existingOut) return new Response(JSON.stringify({ error: 'You already have a pending outgoing challenge.' }), { headers: corsHeaders });

    // Check no active incoming challenge on challenged player
    const { data: existingIn } = await supabase
      .from('challenges')
      .select('id')
      .eq('challenged_id', challenged_player_id)
      .eq('status', 'pending')
      .single();
    if (existingIn) return new Response(JSON.stringify({ error: 'That player already has a pending challenge.' }), { headers: corsHeaders });

    // Create challenge
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: challenge, error: insertErr } = await supabase.from('challenges').insert({
      challenger_id: challenger.id,
      challenged_id: challenged_player_id,
      discipline,
      race_length,
      status: 'pending',
      expires_at: expiresAt,
    }).select().single();
    if (insertErr) throw insertErr;

    // Award +2 points to challenger
    await supabase.rpc('increment_points', { pid: challenger.id, pts: 2 }).catch(() => {
      // Fallback if RPC doesn't exist — direct update
      return supabase.from('player_season_stats')
        .update({ points: supabase.rpc('player_season_stats_points_increment', { pid: challenger.id }) })
        .eq('player_id', challenger.id);
    });
    // Simple direct increment
    const { data: stats } = await supabase.from('player_season_stats').select('points').eq('player_id', challenger.id).single();
    if (stats) {
      await supabase.from('player_season_stats').update({ points: stats.points + 2 }).eq('player_id', challenger.id);
    }

    // Notify challenged player
    const { data: challengerPlayer } = await supabase.from('players').select('full_name').eq('id', challenger.id).single();
    await supabase.from('notifications').insert({
      player_id: challenged_player_id,
      type: 'challenge_received',
      title: `⚔️ ${challengerPlayer?.full_name} challenged you!`,
      body: `${discipline} · Race to ${race_length}. You have 14 days to respond.`,
      reference_id: challenge.id,
      reference_type: 'challenge',
    });

    // Activity feed
    const { data: challengedPlayer } = await supabase.from('players').select('full_name').eq('id', challenged_player_id).single();
    await supabase.from('activity_feed').insert({
      event_type: 'challenge_issued',
      headline: `${challengerPlayer?.full_name} challenged ${challengedPlayer?.full_name} to ${discipline}!`,
      actor_player_id: challenger.id,
    });

    return new Response(JSON.stringify({ challenge_id: challenge.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
