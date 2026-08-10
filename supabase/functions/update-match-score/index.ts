import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const MATCH_SCORE_STATUSES = ['scheduled', 'in_progress'];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: { user } } = await supabase.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', ''));
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });

    const { match_id, my_score, opponent_score } = await req.json();
    if (!Number.isInteger(my_score) || !Number.isInteger(opponent_score) || my_score < 0 || opponent_score < 0) {
      return new Response(JSON.stringify({ error: 'Scores must be non-negative whole numbers.' }), { status: 400, headers: cors });
    }

    const { data: match } = await supabase.from('matches').select('*').eq('id', match_id).single();
    if (!match) return new Response(JSON.stringify({ error: 'Match not found.' }), { status: 404, headers: cors });
    if (!MATCH_SCORE_STATUSES.includes(match.status)) {
      return new Response(JSON.stringify({ error: 'Scores can only be changed before result submission.' }), { status: 409, headers: cors });
    }

    const { data: caller } = await supabase.from('players').select('id').eq('profile_id', user.id).single();
    if (!caller) return new Response(JSON.stringify({ error: 'Player not found.' }), { status: 404, headers: cors });

    const isP1 = match.player1_id === caller.id;
    const isP2 = match.player2_id === caller.id;
    if (!isP1 && !isP2) return new Response(JSON.stringify({ error: 'Not a participant in this match.' }), { status: 403, headers: cors });

    // Single scoreboard: once an initiator is recorded, only they may keep score.
    // Older matches without an initiator stay open to either participant.
    if (match.initiated_by_player_id && match.initiated_by_player_id !== caller.id) {
      return new Response(JSON.stringify({ error: 'Only the match initiator can update the score.' }), { status: 403, headers: cors });
    }

    const newP1Score = isP1 ? my_score : opponent_score;
    const newP2Score = isP1 ? opponent_score : my_score;

    // Prevent scores exceeding race_length
    if (newP1Score > match.race_length || newP2Score > match.race_length) {
      return new Response(JSON.stringify({ error: 'Score cannot exceed race length.' }), { status: 400, headers: cors });
    }

    // Prevent ties — once one player reaches race_length the other cannot also reach it
    if (newP1Score >= match.race_length && newP2Score >= match.race_length) {
      return new Response(JSON.stringify({ error: 'Tie not possible. Only one player can win.' }), { status: 400, headers: cors });
    }

    const updates: Record<string, unknown> = {};

    // Transition to in_progress if needed
    if (match.status === 'scheduled') {
      updates.status = 'in_progress';
      updates.started_at = new Date().toISOString();
    }

    updates.player1_score = newP1Score;
    updates.player2_score = newP2Score;

    const { data: updatedRows, error: updateError } = await supabase
      .from('matches')
      .update(updates)
      .eq('id', match_id)
      .in('status', MATCH_SCORE_STATUSES)
      .select('id');
    if (updateError) throw updateError;
    if (!updatedRows?.length) {
      return new Response(JSON.stringify({ error: 'Scores can only be changed before result submission.' }), { status: 409, headers: cors });
    }

    // Emit a League Journal event the first time a match goes live.
    if (match.status === 'scheduled') {
      const [{ data: p1 }, { data: p2 }] = await Promise.all([
        supabase.from('players').select('full_name').eq('id', match.player1_id).single(),
        supabase.from('players').select('full_name').eq('id', match.player2_id).single(),
      ]);
      await supabase.from('activity_feed').insert({
        event_type: 'match_started',
        headline: `${p1?.full_name ?? 'Player 1'} vs ${p2?.full_name ?? 'Player 2'} — ${match.discipline} match started`,
        detail: `Race to ${match.race_length} at ${match.venue}`,
        actor_player_id: caller.id,
      });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    // Postgres errors carry constraint, column and table names. Log the real
    // one for us; return something a player can act on.
    console.error(`[update-match-score] unhandled: ${e instanceof Error ? e.message : String(e)}`);
    return new Response(JSON.stringify({ error: 'Something went wrong on our end. Please try again.' }), { status: 500, headers: cors });
  }
});
