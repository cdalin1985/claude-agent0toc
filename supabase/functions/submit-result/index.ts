import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

async function confirmResult(supabase: ReturnType<typeof createClient>, matchId: string, winnerId: string, loserId: string, p1Score: number, p2Score: number) {
  // Update match status
  await supabase.from('matches').update({
    status: 'confirmed',
    winner_id: winnerId,
    loser_id: loserId,
    player1_score: p1Score,
    player2_score: p2Score,
    completed_at: new Date().toISOString(),
  }).eq('id', matchId);

  // Update challenge status
  const { data: match } = await supabase.from('matches').select('challenge_id').eq('id', matchId).single();
  if (match) await supabase.from('challenges').update({ status: 'confirmed' }).eq('id', match.challenge_id);

  // Get current rankings
  const [winnerRank, loserRank] = await Promise.all([
    supabase.from('rankings').select('position').eq('player_id', winnerId).single(),
    supabase.from('rankings').select('position').eq('player_id', loserId).single(),
  ]);

  if (winnerRank.data && loserRank.data) {
    const wPos = winnerRank.data.position;
    const lPos = loserRank.data.position;

    // Ranking cascade: only if lower-ranked player (higher position number) wins
    if (wPos > lPos) {
      // Move everyone between lPos and wPos down by 1
      const { data: middlePlayers } = await supabase
        .from('rankings')
        .select('id, position')
        .gte('position', lPos)
        .lt('position', wPos)
        .neq('player_id', winnerId);

      if (middlePlayers) {
        for (const p of middlePlayers) {
          await supabase.from('rankings').update({ previous_position: p.position, position: p.position + 1 }).eq('id', p.id);
        }
      }

      // Move winner to loser's old position
      await supabase.from('rankings').update({ previous_position: wPos, position: lPos }).eq('player_id', winnerId);
    }
  }

  // Update stats
  const [winnerStats, loserStats] = await Promise.all([
    supabase.from('player_season_stats').select('*').eq('player_id', winnerId).single(),
    supabase.from('player_season_stats').select('*').eq('player_id', loserId).single(),
  ]);

  if (winnerStats.data) {
    const s = winnerStats.data;
    const newStreak = s.current_streak >= 0 ? s.current_streak + 1 : 1;
    await supabase.from('player_season_stats').update({
      wins: s.wins + 1,
      matches_played: s.matches_played + 1,
      points: s.points + 3, // +1 played, +2 won
      current_streak: newStreak,
      best_streak: Math.max(s.best_streak, newStreak),
    }).eq('player_id', winnerId);
  }

  if (loserStats.data) {
    const s = loserStats.data;
    await supabase.from('player_season_stats').update({
      losses: s.losses + 1,
      matches_played: s.matches_played + 1,
      points: s.points + 1, // +1 played
      current_streak: -1,
    }).eq('player_id', loserId);
  }

  // Set 24h cooldowns on both players
  const now = Date.now();
  const exp = new Date(now + 24 * 3600 * 1000).toISOString();
  await supabase.from('cooldowns').insert([
    { player_id: winnerId, type: 'post_match', expires_at: exp },
    { player_id: loserId, type: 'post_match', expires_at: exp },
  ]);

  // Notifications
  const [wp, lp] = await Promise.all([
    supabase.from('players').select('full_name').eq('id', winnerId).single(),
    supabase.from('players').select('full_name').eq('id', loserId).single(),
  ]);

  await supabase.from('notifications').insert([
    { player_id: winnerId, type: 'result_confirmed', title: '🏆 Match confirmed — Victory!', body: `Final score: ${p1Score}–${p2Score}`, reference_id: matchId, reference_type: 'match' },
    { player_id: loserId,  type: 'result_confirmed', title: '📊 Match confirmed',            body: `Final score: ${p1Score}–${p2Score}`, reference_id: matchId, reference_type: 'match' },
  ]);

  // Activity feed
  await supabase.from('activity_feed').insert({
    event_type: 'match_confirmed',
    headline: `${wp.data?.full_name} defeated ${lp.data?.full_name} (${p1Score}–${p2Score})`,
    actor_player_id: winnerId,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: { user } } = await supabase.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', ''));
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });

    const { match_id, winner_id, final_score_player1, final_score_player2 } = await req.json();

    const { data: match } = await supabase.from('matches').select('*').eq('id', match_id).single();
    if (!match) return new Response(JSON.stringify({ error: 'Match not found.' }), { headers: cors });
    if (!['in_progress', 'scheduled'].includes(match.status)) return new Response(JSON.stringify({ error: 'Match is not in progress.' }), { headers: cors });

    const { data: caller } = await supabase.from('players').select('id').eq('profile_id', user.id).single();
    if (!caller) return new Response(JSON.stringify({ error: 'Player not found.' }), { headers: cors });

    const isP1 = match.player1_id === caller.id;
    const isP2 = match.player2_id === caller.id;
    if (!isP1 && !isP2) return new Response(JSON.stringify({ error: 'Not a participant.' }), { headers: cors });

    // Mark this player's submission
    const submissionUpdates: Record<string, unknown> = {};
    if (isP1) submissionUpdates.player1_submitted = true;
    else      submissionUpdates.player2_submitted = true;

    // Also update scores from this player's perspective
    submissionUpdates.player1_score = final_score_player1;
    submissionUpdates.player2_score = final_score_player2;
    submissionUpdates.status = 'submitted';

    await supabase.from('matches').update(submissionUpdates).eq('id', match_id);

    // Re-fetch to check if both submitted
    const { data: updated } = await supabase.from('matches').select('*').eq('id', match_id).single();
    if (!updated) return new Response(JSON.stringify({ error: 'Update failed.' }), { headers: cors });

    if (updated.player1_submitted && updated.player2_submitted) {
      // Both submitted — check if they match
      // We trust the most recently submitted scores
      const loser_id = winner_id === match.player1_id ? match.player2_id : match.player1_id;
      await confirmResult(supabase, match_id, winner_id, loser_id, final_score_player1, final_score_player2);
    } else {
      // Notify other player to submit
      const otherId = isP1 ? match.player2_id : match.player1_id;
      const { data: callerPlayer } = await supabase.from('players').select('full_name').eq('id', caller.id).single();
      await supabase.from('notifications').insert({
        player_id: otherId,
        type: 'result_submitted',
        title: '📊 Opponent submitted result',
        body: `${callerPlayer?.full_name} submitted the match result. Please submit yours to confirm.`,
        reference_id: match_id,
        reference_type: 'match',
      });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
