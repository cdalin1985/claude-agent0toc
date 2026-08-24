// Applies the no-show rule added to the board on 2 August 2026:
//
//   "A no show w/o letting your opponent know will drop you to the challengers
//    original spot. Both players will swap spots in the standings."
//
// Admin-only, deliberately. Every other ranking move in this app is triggered
// by something a player does to themselves -- you lose, you decline, you
// withdraw. This is the first that is an accusation about somebody else, and
// the penalty is a rank swap, so self-service would let any member move a rival
// down the ladder by claiming they did not turn up. The players take it to an
// admin; the app's job is to make the ladder move correctly and record who
// decided it.
//
// The swap itself lives in apply_no_show_swap. Everything ranking-related is
// done inside that one locked call rather than as a sequence of writes from
// here, because a half-applied swap leaves two players holding one position.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server is missing Supabase configuration.' }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const { data: actorProfile, error: actorError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (actorError || !actorProfile) return json({ error: 'Admin profile not found.' }, 403);
  if (!['admin', 'super_admin'].includes(actorProfile.role)) {
    return json({ error: 'Only admins can record a no-show.' }, 403);
  }

  let body: { challenge_id?: unknown; no_show_player_id?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const challengeId = typeof body.challenge_id === 'string' ? body.challenge_id.trim() : '';
  const noShowPlayerId = typeof body.no_show_player_id === 'string' ? body.no_show_player_id.trim() : '';
  if (!challengeId) return json({ error: 'challenge_id is required.' }, 400);
  if (!noShowPlayerId) return json({ error: 'no_show_player_id is required.' }, 400);
  const note = typeof body.note === 'string' && body.note.trim() !== '' ? body.note.trim().slice(0, 500) : null;

  // Read the names before the swap, so the feed can describe the move that
  // happened rather than the state afterwards.
  const { data: challenge, error: challengeError } = await supabase
    .from('challenges')
    .select('id, challenger_id, challenged_id, status, discipline, race_length')
    .eq('id', challengeId)
    .maybeSingle();
  if (challengeError) return json({ error: challengeError.message }, 500);
  if (!challenge) return json({ error: 'Challenge not found.' }, 404);

  if (![challenge.challenger_id, challenge.challenged_id].includes(noShowPlayerId)) {
    return json({ error: 'That player is not part of this challenge.' }, 400);
  }
  if (!['accepted', 'scheduled'].includes(challenge.status)) {
    return json({
      error: `This challenge is ${challenge.status}, so there was no arranged match to miss.`,
    }, 409);
  }

  const opponentId = noShowPlayerId === challenge.challenger_id
    ? challenge.challenged_id
    : challenge.challenger_id;

  const { data: names } = await supabase
    .from('players')
    .select('id, full_name')
    .in('id', [noShowPlayerId, opponentId]);
  const nameFor = (id: string) => names?.find((p: { id: string }) => p.id === id)?.full_name ?? 'A player';

  const { data: result, error: swapError } = await supabase
    .rpc('apply_no_show_swap', {
      p_challenge_id: challengeId,
      p_no_show_player_id: noShowPlayerId,
    });
  if (swapError) return json({ error: swapError.message }, 500);

  const swapped = Boolean(result?.swapped);
  const noShowName = nameFor(noShowPlayerId);
  const opponentName = nameFor(opponentId);

  await supabase.from('audit_events').insert({
    actor_profile_id: actorProfile.id,
    action: 'challenge.no_show',
    target_type: 'challenge',
    target_id: challengeId,
    detail: {
      no_show_player_id: noShowPlayerId,
      no_show_name: noShowName,
      opponent_id: opponentId,
      opponent_name: opponentName,
      swapped,
      ...(result ?? {}),
      note,
    },
  });

  await supabase.from('activity_feed').insert({
    event_type: 'challenge_no_show',
    headline: swapped
      ? `${noShowName} was a no-show and swapped spots with ${opponentName}.`
      : `${noShowName} was a no-show against ${opponentName}.`,
    // When the no-show already sat below their opponent there is no spot to
    // drop to. Say so, rather than letting the feed imply a penalty that the
    // ladder did not actually apply.
    detail: swapped
      ? `${challenge.discipline} · race to ${challenge.race_length} · #${result.no_show_from} → #${result.no_show_to}`
      : `${challenge.discipline} · race to ${challenge.race_length} · already ranked below ${opponentName}, so no spots changed hands`,
    actor_player_id: noShowPlayerId,
  });

  // Both players hear about it. A rank change nobody was told about is how a
  // league night turns into an argument.
  await supabase.from('notifications').insert([
    {
      player_id: noShowPlayerId,
      type: 'no_show_recorded',
      title: 'No-show recorded',
      body: swapped
        ? `An admin recorded you as a no-show against ${opponentName}. You have swapped spots — you are now #${result.no_show_to}.`
        : `An admin recorded you as a no-show against ${opponentName}. No spots changed hands.`,
      reference_id: challengeId,
      reference_type: 'challenge',
    },
    {
      player_id: opponentId,
      type: 'no_show_recorded',
      title: 'Your opponent was a no-show',
      body: swapped
        ? `${noShowName} did not show. You have swapped spots — you are now #${result.opponent_to}.`
        : `${noShowName} did not show. They were already below you, so no spots changed hands.`,
      reference_id: challengeId,
      reference_type: 'challenge',
    },
  ]);

  return json({ success: true, swapped, ...(result ?? {}) });
});
