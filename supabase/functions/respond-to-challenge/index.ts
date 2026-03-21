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

    const { challenge_id, action, venue, scheduled_at } = await req.json();

    const { data: challenge } = await supabase.from('challenges').select('*').eq('id', challenge_id).single();
    if (!challenge) return new Response(JSON.stringify({ error: 'Challenge not found.' }), { headers: cors });

    const { data: callerPlayer } = await supabase.from('players').select('id, full_name').eq('profile_id', user.id).single();
    if (!callerPlayer) return new Response(JSON.stringify({ error: 'Player profile not found.' }), { headers: cors });

    if (action === 'accept') {
      if (challenge.challenged_id !== callerPlayer.id) return new Response(JSON.stringify({ error: 'Not authorized.' }), { headers: cors });
      if (challenge.status !== 'pending') return new Response(JSON.stringify({ error: 'Challenge is not pending.' }), { headers: cors });
      if (!venue || !scheduled_at) return new Response(JSON.stringify({ error: 'venue and scheduled_at required.' }), { headers: cors });

      // Match must be played within 10 days of acceptance
      const matchDeadline = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();

      await supabase.from('challenges').update({
        status: 'scheduled',
        venue,
        scheduled_at,
        match_deadline: matchDeadline,
      }).eq('id', challenge_id);

      const { data: match } = await supabase.from('matches').insert({
        challenge_id,
        player1_id: challenge.challenger_id,
        player2_id: challenge.challenged_id,
        discipline: challenge.discipline,
        race_length: challenge.race_length,
        venue,
        scheduled_at,
        status: 'scheduled',
      }).select().single();

      const { data: challengedPlayer } = await supabase.from('players').select('full_name').eq('id', challenge.challenged_id).single();
      await supabase.from('notifications').insert({
        player_id: challenge.challenger_id,
        type: 'challenge_accepted',
        title: `✅ Challenge accepted!`,
        body: `${challengedPlayer?.full_name} accepted your ${challenge.discipline} challenge. Match on ${new Date(scheduled_at).toLocaleDateString()} at ${venue}.`,
        reference_id: match?.id,
        reference_type: 'match',
      });

      const { data: challengerPlayer } = await supabase.from('players').select('full_name').eq('id', challenge.challenger_id).single();
      await supabase.from('activity_feed').insert({
        event_type: 'challenge_accepted',
        headline: `${challengedPlayer?.full_name} accepted ${challengerPlayer?.full_name}'s ${challenge.discipline} challenge!`,
        detail: `Match at ${venue} on ${new Date(scheduled_at).toLocaleDateString()}`,
        actor_player_id: challenge.challenged_id,
      });

    } else if (action === 'decline') {
      if (challenge.challenged_id !== callerPlayer.id) return new Response(JSON.stringify({ error: 'Not authorized.' }), { headers: cors });
      if (challenge.status !== 'pending') return new Response(JSON.stringify({ error: 'Challenge is not pending.' }), { headers: cors });

      await supabase.from('challenges').update({ status: 'declined' }).eq('id', challenge_id);

      // No cooldown on the decliner — admin will confirm the spot move
      // Notify admin players of the decline so they can confirm the forfeit
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'super_admin']);

      const { data: challengerPlayer } = await supabase.from('players').select('full_name').eq('id', challenge.challenger_id).single();
      const { data: challengedPlayer } = await supabase.from('players').select('full_name').eq('id', challenge.challenged_id).single();

      if (admins && admins.length > 0) {
        // Find admin player records for notification
        const { data: adminPlayers } = await supabase
          .from('players')
          .select('id')
          .in('profile_id', admins.map((a: { id: string }) => a.id));

        if (adminPlayers && adminPlayers.length > 0) {
          await supabase.from('notifications').insert(
            adminPlayers.map((ap: { id: string }) => ({
              player_id: ap.id,
              type: 'challenge_declined_admin',
              title: `⚠️ Challenge declined — action needed`,
              body: `${challengedPlayer?.full_name} declined ${challengerPlayer?.full_name}'s challenge. Confirm if ${challengerPlayer?.full_name} should take the spot.`,
              reference_id: challenge_id,
              reference_type: 'challenge',
            }))
          );
        }
      }

      // Notify challenger of the decline
      await supabase.from('notifications').insert({
        player_id: challenge.challenger_id,
        type: 'challenge_declined',
        title: `❌ Challenge declined`,
        body: `${challengedPlayer?.full_name} declined your ${challenge.discipline} challenge. An admin will confirm your spot move.`,
        reference_id: challenge_id,
        reference_type: 'challenge',
      });

    } else if (action === 'wash') {
      // Either player can declare a scheduling wash — treated as if the challenge never happened
      const isChallenger = challenge.challenger_id === callerPlayer.id;
      const isChallenged  = challenge.challenged_id === callerPlayer.id;
      if (!isChallenger && !isChallenged) return new Response(JSON.stringify({ error: 'Not authorized.' }), { headers: cors });
      if (!['pending', 'accepted', 'scheduled'].includes(challenge.status)) {
        return new Response(JSON.stringify({ error: 'Challenge cannot be washed at this stage.' }), { headers: cors });
      }

      // Cancel with no penalties — no cooldowns, no rank changes
      await supabase.from('challenges').update({ status: 'cancelled' }).eq('id', challenge_id);

      // Also cancel the associated match if one was created
      await supabase.from('matches').update({ status: 'resolved' }).eq('challenge_id', challenge_id);

    } else if (action === 'cancel') {
      // Challenger cancels their own pending challenge
      if (challenge.challenger_id !== callerPlayer.id) return new Response(JSON.stringify({ error: 'Not authorized.' }), { headers: cors });
      if (challenge.status !== 'pending') return new Response(JSON.stringify({ error: 'Can only cancel pending challenges.' }), { headers: cors });
      await supabase.from('challenges').update({ status: 'cancelled' }).eq('id', challenge_id);

    } else {
      return new Response(JSON.stringify({ error: 'Invalid action.' }), { headers: cors });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
