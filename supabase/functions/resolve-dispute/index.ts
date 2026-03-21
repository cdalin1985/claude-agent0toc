import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: { user } } = await supabase.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', ''));
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });

    // Check admin role
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Admin access required.' }), { status: 403, headers: cors });
    }

    const { match_id, winner_id, final_score_player1, final_score_player2, notes } = await req.json();

    const { data: match } = await supabase.from('matches').select('*').eq('id', match_id).single();
    if (!match) return new Response(JSON.stringify({ error: 'Match not found.' }), { headers: cors });

    const loser_id = winner_id === match.player1_id ? match.player2_id : match.player1_id;

    // Update match to resolved
    await supabase.from('matches').update({
      status: 'resolved',
      winner_id,
      loser_id,
      player1_score: final_score_player1,
      player2_score: final_score_player2,
      completed_at: new Date().toISOString(),
    }).eq('id', match_id);

    if (match.challenge_id) {
      await supabase.from('challenges').update({ status: 'resolved' }).eq('id', match.challenge_id);
    }

    // Apply ranking cascade
    const [winnerRank, loserRank] = await Promise.all([
      supabase.from('rankings').select('position').eq('player_id', winner_id).single(),
      supabase.from('rankings').select('position').eq('player_id', loser_id).single(),
    ]);
    if (winnerRank.data && loserRank.data && winnerRank.data.position > loserRank.data.position) {
      const wPos = winnerRank.data.position;
      const lPos = loserRank.data.position;
      const { data: middle } = await supabase.from('rankings').select('id, position').gte('position', lPos).lt('position', wPos).neq('player_id', winner_id);
      if (middle) {
        for (const p of middle) await supabase.from('rankings').update({ previous_position: p.position, position: p.position + 1 }).eq('id', p.id);
      }
      await supabase.from('rankings').update({ previous_position: wPos, position: lPos }).eq('player_id', winner_id);
    }

    // Update stats
    const [ws, ls] = await Promise.all([
      supabase.from('player_season_stats').select('*').eq('player_id', winner_id).single(),
      supabase.from('player_season_stats').select('*').eq('player_id', loser_id).single(),
    ]);
    if (ws.data) {
      const s = ws.data;
      const streak = s.current_streak >= 0 ? s.current_streak + 1 : 1;
      await supabase.from('player_season_stats').update({ wins: s.wins + 1, matches_played: s.matches_played + 1, points: s.points + 3, current_streak: streak, best_streak: Math.max(s.best_streak, streak) }).eq('player_id', winner_id);
    }
    if (ls.data) {
      const s = ls.data;
      await supabase.from('player_season_stats').update({ losses: s.losses + 1, matches_played: s.matches_played + 1, points: s.points + 1, current_streak: -1 }).eq('player_id', loser_id);
    }

    // Audit log
    await supabase.from('audit_events').insert({
      actor_profile_id: user.id,
      action: 'resolve_dispute',
      target_type: 'match',
      target_id: match_id,
      detail: { winner_id, notes },
    });

    // Notifications
    const [wp, lp] = await Promise.all([
      supabase.from('players').select('full_name').eq('id', winner_id).single(),
      supabase.from('players').select('full_name').eq('id', loser_id).single(),
    ]);
    await supabase.from('notifications').insert([
      { player_id: winner_id, type: 'result_confirmed', title: '🏆 Dispute resolved — you won!', body: `Admin ruled in your favor. ${final_score_player1}–${final_score_player2}.`, reference_id: match_id, reference_type: 'match' },
      { player_id: loser_id,  type: 'result_confirmed', title: '📊 Dispute resolved',            body: `Admin ruled: ${wp.data?.full_name} wins ${final_score_player1}–${final_score_player2}.`, reference_id: match_id, reference_type: 'match' },
    ]);

    await supabase.from('activity_feed').insert({
      event_type: 'dispute_resolved',
      headline: `Admin resolved disputed match: ${wp.data?.full_name} defeated ${lp.data?.full_name}`,
      actor_player_id: winner_id,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
