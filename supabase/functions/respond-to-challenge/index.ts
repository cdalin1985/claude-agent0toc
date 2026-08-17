import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPush } from '../_shared/sendPush.ts';
import { formatLeagueDateTime } from '../_shared/leagueTime.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const VALID_VENUES = ['Eagles 4040', 'Valley Hub'];

// How many venue/time suggestions a single challenge may carry in total, across
// both players. Three is the league's ruling (2026-08-12): enough for an offer,
// a counter and a compromise, but not enough to negotiate indefinitely.
const MAX_PROPOSAL_ROUNDS = 3;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: { user } } = await supabase.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', ''));
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });

    const { challenge_id, action, venue, scheduled_at, response_message } = await req.json();

    // Sweep before reading, so the row below carries a status that reflects the
    // clock. The cron job (challenge-expiry-check, every 15 minutes) is what
    // keeps stored state honest for everyone else; this call is what makes the
    // window zero for the player actually trying to act. Idempotent and already
    // granted to authenticated -- create-challenge does the same thing.
    await supabase.rpc('expire_stale_challenges');

    const { data: challenge } = await supabase.from('challenges').select('*').eq('id', challenge_id).single();
    if (!challenge) return new Response(JSON.stringify({ error: 'Challenge not found.' }), { status: 404, headers: cors });

    // An expired challenge is finished. Nothing may advance it.
    //
    // 'decline' is the one that matters most here: declining applies a forfeit
    // loss through apply_challenge_decline_forfeit. Letting someone decline a
    // challenge that already expired would penalise them for a challenge the
    // rules say carries no penalty -- the exact inversion of the league ruling
    // that expiry costs nobody anything.
    //
    // 'cancel' stays open: that is the challenger clearing away their own dead
    // challenge, which harms no one and leaves the ladder unchanged.
    if (challenge.status === 'expired' && action !== 'cancel') {
      return new Response(JSON.stringify({
        error: `This challenge expired on ${formatLeagueDateTime(challenge.expires_at)}. Nobody is penalised for an expired challenge — ask them for a fresh one.`,
      }), { status: 409, headers: cors });
    }

    const { data: callerPlayer } = await supabase.from('players').select('id, full_name').eq('profile_id', user.id).single();
    if (!callerPlayer) return new Response(JSON.stringify({ error: 'Player profile not found.' }), { status: 404, headers: cors });

    // 'accept' is the legacy one-shot action: the challenged player picked both
    // the venue and the time and it was locked in, with no way for the
    // challenger to counter. It now means the same as 'propose' so a client
    // still running the old bundle lands in the negotiation rather than
    // breaking.
    if (action === 'propose' || action === 'accept') {
      const isChallenger = challenge.challenger_id === callerPlayer.id;
      const isChallenged = challenge.challenged_id === callerPlayer.id;
      if (!isChallenger && !isChallenged) return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 403, headers: cors });
      if (!['pending', 'accepted'].includes(challenge.status)) {
        return new Response(JSON.stringify({ error: 'This challenge is not open for scheduling.' }), { status: 409, headers: cors });
      }
      // The challenger has already made their move by issuing the challenge;
      // the first word on when and where is the challenged player's.
      if (challenge.status === 'pending' && !isChallenged) {
        return new Response(JSON.stringify({ error: 'Wait for them to respond to your challenge first.' }), { status: 409, headers: cors });
      }
      if (!venue || !scheduled_at) return new Response(JSON.stringify({ error: 'venue and scheduled_at required.' }), { status: 400, headers: cors });

      const scheduledAt = new Date(scheduled_at);
      if (Number.isNaN(scheduledAt.getTime())) return new Response(JSON.stringify({ error: 'scheduled_at must be a valid date.' }), { status: 400, headers: cors });
      if (scheduledAt.getTime() < Date.now() - 5 * 60 * 1000) return new Response(JSON.stringify({ error: 'Match cannot be scheduled in the past.' }), { status: 400, headers: cors });

      const { data: settings } = await supabase.from('league_settings').select('venues, match_play_days').single();
      const validVenues = Array.isArray(settings?.venues) && settings.venues.length > 0 ? settings.venues : VALID_VENUES;
      if (typeof venue !== 'string' || !validVenues.includes(venue)) {
        return new Response(JSON.stringify({ error: 'Venue is not in league settings.' }), { status: 400, headers: cors });
      }

      // Upper bound on how far out a match can be agreed.
      //
      // accept_proposal sets match_deadline = now + match_play_days, and
      // expire_overdue_matches() rules anything past that a wash. Nothing used to
      // cross-check the two, so agreeing a date beyond the window guaranteed the
      // match was auto-cancelled BEFORE it was due to be played -- and the push
      // blamed the players for not playing it. A proposal for 2031 was accepted
      // with a 200.
      const matchPlayDays = settings?.match_play_days ?? 10;
      const latestPlayable = new Date(Date.now() + matchPlayDays * 24 * 3600 * 1000);
      if (scheduledAt.getTime() > latestPlayable.getTime()) {
        return new Response(JSON.stringify({
          error: `A match has to be played within ${matchPlayDays} days. Pick a time before ${formatLeagueDateTime(latestPlayable)}.`,
        }), { status: 400, headers: cors });
      }

      const { data: liveProposal, error: liveError } = await supabase
        .from('challenge_proposals')
        .select('id, proposed_by_player_id')
        .eq('challenge_id', challenge_id)
        .eq('status', 'pending')
        .maybeSingle();
      if (liveError) throw liveError;

      // Turn order: you cannot counter your own outstanding proposal. Without
      // this a player could bury the other under proposals they never had a
      // chance to answer.
      if (liveProposal && liveProposal.proposed_by_player_id === callerPlayer.id) {
        return new Response(JSON.stringify({ error: "You've already proposed a time — it's their turn to reply." }), { status: 409, headers: cors });
      }

      // Negotiation is capped at MAX_PROPOSAL_ROUNDS. Unbounded countering let a
      // player who did not want to play keep a challenge alive indefinitely
      // without ever accepting or declining. Checked BEFORE the supersede below,
      // so a rejected counter never closes the live proposal on its way out.
      const { count: roundsSoFar, error: countError } = await supabase
        .from('challenge_proposals')
        .select('id', { count: 'exact', head: true })
        .eq('challenge_id', challenge_id);
      if (countError) throw countError;

      if ((roundsSoFar ?? 0) >= MAX_PROPOSAL_ROUNDS) {
        return new Response(JSON.stringify({
          error: `You've both had ${MAX_PROPOSAL_ROUNDS} goes at picking a time. Take the last suggestion, or call it a wash and start fresh.`,
        }), { status: 409, headers: cors });
      }

      if (liveProposal) {
        const { error: supersedeError } = await supabase
          .from('challenge_proposals')
          .update({ status: 'superseded', responded_at: new Date().toISOString() })
          .eq('id', liveProposal.id)
          .eq('status', 'pending');
        if (supersedeError) throw supersedeError;
      }

      const { error: proposalError } = await supabase.from('challenge_proposals').insert({
        challenge_id,
        proposed_by_player_id: callerPlayer.id,
        venue,
        scheduled_at: scheduledAt.toISOString(),
        message: typeof response_message === 'string' ? response_message.slice(0, 280) : null,
      });
      if (proposalError) throw proposalError;

      // 'accepted' means "answered, now agreeing on when and where". Guarded so
      // two simultaneous first proposals cannot both move the challenge.
      if (challenge.status === 'pending') {
        const { error: statusError } = await supabase
          .from('challenges')
          .update({ status: 'accepted' })
          .eq('id', challenge_id)
          .eq('status', 'pending');
        if (statusError) throw statusError;
      }

      const otherId = isChallenger ? challenge.challenged_id : challenge.challenger_id;
      const [{ data: mePlayer }, { data: themPlayer }] = await Promise.all([
        supabase.from('players').select('full_name').eq('id', callerPlayer.id).single(),
        supabase.from('players').select('full_name').eq('id', otherId).single(),
      ]);
      const when = `${formatLeagueDateTime(scheduledAt)} at ${venue}`;
      const countering = Boolean(liveProposal);

      const { error: notificationError } = await supabase.from('notifications').insert({
        player_id: otherId,
        type: 'challenge_accepted',
        title: countering ? '🗓️ New time suggested' : '✅ Challenge answered',
        body: countering
          ? `${mePlayer?.full_name} suggested ${when} instead. Accept it or suggest another.`
          : `${mePlayer?.full_name} suggested ${when} for your ${challenge.discipline} match. Accept it or suggest another.`,
        reference_id: challenge_id,
        reference_type: 'challenge',
      });
      if (notificationError) throw notificationError;
      await sendPush(
        supabase,
        otherId,
        countering ? '🗓️ New time suggested' : '✅ Challenge answered',
        `${mePlayer?.full_name} suggested ${when}.`,
        '/challenges',
        // Without this the category is unknown, playerWantsPush skips the mute
        // check, and a player who turned challenge notifications off has the
        // in-app row dropped by apply_notification_preferences while their
        // phone still buzzes -- the exact split sendPush.ts:23-32 forbids.
        'challenge_accepted',
      );

      const { error: activityError } = await supabase.from('activity_feed').insert({
        event_type: 'challenge_accepted',
        headline: countering
          ? `${mePlayer?.full_name} countered with a new time against ${themPlayer?.full_name}.`
          : `${mePlayer?.full_name} answered ${themPlayer?.full_name}'s ${challenge.discipline} challenge — working out a time.`,
        detail: `Proposed ${when} · race to ${challenge.race_length}`,
        actor_player_id: callerPlayer.id,
      });
      if (activityError) throw activityError;

    } else if (action === 'accept_proposal') {
      const isChallenger = challenge.challenger_id === callerPlayer.id;
      const isChallenged = challenge.challenged_id === callerPlayer.id;
      if (!isChallenger && !isChallenged) return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 403, headers: cors });
      if (challenge.status !== 'accepted') {
        return new Response(JSON.stringify({ error: 'There is nothing to agree to on this challenge.' }), { status: 409, headers: cors });
      }

      const { data: proposal, error: proposalReadError } = await supabase
        .from('challenge_proposals')
        .select('id, proposed_by_player_id, venue, scheduled_at')
        .eq('challenge_id', challenge_id)
        .eq('status', 'pending')
        .maybeSingle();
      if (proposalReadError) throw proposalReadError;
      if (!proposal) {
        return new Response(JSON.stringify({ error: 'That time is no longer on the table. Refresh and take another look.' }), { status: 409, headers: cors });
      }
      // You agree to THEIR proposal, not your own.
      if (proposal.proposed_by_player_id === callerPlayer.id) {
        return new Response(JSON.stringify({ error: "That's your own suggestion — you're waiting on them." }), { status: 409, headers: cors });
      }

      const scheduledAt = new Date(proposal.scheduled_at);
      const { data: settings } = await supabase.from('league_settings').select('match_play_days').single();
      // README: "Once accepted, the match must be played within 10 days."
      // expire_overdue_matches() reads this deadline and rules anything past it a wash.
      const matchPlayDays = settings?.match_play_days ?? 10;
      const matchDeadline = new Date(Date.now() + matchPlayDays * 24 * 3600 * 1000).toISOString();

      // Claim the proposal first: it is the narrowest row, and winning it is
      // what entitles this request to create the match.
      const { data: claimedProposal, error: claimError } = await supabase
        .from('challenge_proposals')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', proposal.id)
        .eq('status', 'pending')
        .select('id');
      if (claimError) throw claimError;
      if (!claimedProposal?.length) {
        return new Response(JSON.stringify({ error: 'That time is no longer on the table. Refresh and take another look.' }), { status: 409, headers: cors });
      }

      const { data: scheduledChallenge, error: updateError } = await supabase
        .from('challenges')
        .update({
          status: 'scheduled',
          venue: proposal.venue,
          scheduled_at: scheduledAt.toISOString(),
          match_deadline: matchDeadline,
        })
        .eq('id', challenge_id)
        .eq('status', 'accepted')
        .select('id');
      if (updateError) throw updateError;
      if (!scheduledChallenge?.length) {
        return new Response(JSON.stringify({ error: 'This challenge has already moved on.' }), { status: 409, headers: cors });
      }

      const { data: match, error: insertError } = await supabase.from('matches').insert({
        challenge_id,
        player1_id: challenge.challenger_id,
        player2_id: challenge.challenged_id,
        discipline: challenge.discipline,
        race_length: challenge.race_length,
        venue: proposal.venue,
        scheduled_at: scheduledAt.toISOString(),
        status: 'scheduled',
        // Single-scoreboard is claimed by whoever taps "Start Match" first during play.
        // Leaving this NULL at accept time lets either player start the match.
      }).select().single();
      if (insertError) throw insertError;

      const otherId = isChallenger ? challenge.challenged_id : challenge.challenger_id;
      const [{ data: mePlayer }, { data: themPlayer }] = await Promise.all([
        supabase.from('players').select('full_name').eq('id', callerPlayer.id).single(),
        supabase.from('players').select('full_name').eq('id', otherId).single(),
      ]);
      const when = `${formatLeagueDateTime(scheduledAt)} at ${proposal.venue}`;

      // Both players get this one — it is the moment the match becomes real.
      const { error: notificationError } = await supabase.from('notifications').insert([
        {
          player_id: otherId,
          type: 'challenge_accepted',
          title: '🎱 Match locked in',
          body: `${mePlayer?.full_name} agreed to ${when}. Race to ${challenge.race_length}, ${challenge.discipline}.`,
          reference_id: match?.id,
          reference_type: 'match',
        },
        {
          player_id: callerPlayer.id,
          type: 'challenge_accepted',
          title: '🎱 Match locked in',
          body: `You're on with ${themPlayer?.full_name} — ${when}. Race to ${challenge.race_length}, ${challenge.discipline}.`,
          reference_id: match?.id,
          reference_type: 'match',
        },
      ]);
      if (notificationError) throw notificationError;
      await sendPush(supabase, otherId, '🎱 Match locked in', `${mePlayer?.full_name} agreed to ${when}.`, `/match/${match?.id}`, 'challenge_accepted');

      const { error: activityError } = await supabase.from('activity_feed').insert({
        event_type: 'challenge_accepted',
        headline: `${themPlayer?.full_name} vs ${mePlayer?.full_name} is on — ${when}.`,
        detail: `${challenge.discipline} · race to ${challenge.race_length}`,
        actor_player_id: callerPlayer.id,
      });
      if (activityError) throw activityError;

    } else if (action === 'decline') {
      if (challenge.challenged_id !== callerPlayer.id) return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 403, headers: cors });
      if (challenge.status !== 'pending') return new Response(JSON.stringify({ error: 'Challenge is not pending.' }), { status: 409, headers: cors });

      // A decline is a forfeit — ranking, cooldown, stats, activity, and notifications
      // are all written by apply_challenge_decline_forfeit so admin can later reverse it.
      const { error: rpcError } = await supabase.rpc('apply_challenge_decline_forfeit', {
        p_challenge_id: challenge_id,
        p_actor_profile_id: user.id,
      });
      if (rpcError) {
        console.error(`[respond-to-challenge] decline forfeit failed for ${challenge_id}: ${rpcError.message}`);
        return new Response(JSON.stringify({ error: 'Could not record that decline. Please try again, or ask an admin.' }), { status: 500, headers: cors });
      }

      const { data: challengerPlayer } = await supabase.from('players').select('full_name').eq('id', challenge.challenger_id).single();
      const { data: challengedPlayer } = await supabase.from('players').select('full_name').eq('id', challenge.challenged_id).single();
      await Promise.all([
        sendPush(
          supabase,
          challenge.challenger_id,
          '⚖️ Challenge declined as forfeit',
          `${challengedPlayer?.full_name ?? 'Your opponent'} declined your ${challenge.discipline} challenge — recorded as your win.`,
          '/challenges',
        ),
        sendPush(
          supabase,
          challenge.challenged_id,
          '⚖️ Decline recorded as forfeit',
          `Declining ${challengerPlayer?.full_name ?? 'the challenger'} counted as a loss. Talk to an admin if this was an accident.`,
          '/challenges',
        ),
      ]);

    } else if (action === 'reverse_decline') {
      const { data: actorProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (!actorProfile || !['admin', 'super_admin'].includes(actorProfile.role)) {
        return new Response(JSON.stringify({ error: 'Admin access required.' }), { status: 403, headers: cors });
      }

      const { error: rpcError } = await supabase.rpc('reverse_challenge_decline_forfeit', {
        p_challenge_id: challenge_id,
        p_actor_profile_id: user.id,
      });
      if (rpcError) {
        console.error(`[respond-to-challenge] reverse decline failed for ${challenge_id}: ${rpcError.message}`);
        return new Response(JSON.stringify({ error: 'Could not reverse that decline. The rankings or stats may have moved since.' }), { status: 409, headers: cors });
      }

      const { data: challengerPlayer } = await supabase.from('players').select('full_name').eq('id', challenge.challenger_id).single();
      const { data: challengedPlayer } = await supabase.from('players').select('full_name').eq('id', challenge.challenged_id).single();
      await Promise.all([
        sendPush(
          supabase,
          challenge.challenger_id,
          '↩️ Decline reversed by admin',
          `Your ${challenge.discipline} challenge with ${challengedPlayer?.full_name ?? 'the challenged player'} is pending again.`,
          '/challenges',
        ),
        sendPush(
          supabase,
          challenge.challenged_id,
          '↩️ Decline reversed by admin',
          `${challengerPlayer?.full_name ?? 'The challenger'}'s challenge is pending again — respond when you can.`,
          '/challenges',
        ),
      ]);

    } else if (action === 'wash') {
      // Either player can declare a scheduling wash — treated as if the challenge never happened
      const isChallenger = challenge.challenger_id === callerPlayer.id;
      const isChallenged  = challenge.challenged_id === callerPlayer.id;
      if (!isChallenger && !isChallenged) return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 403, headers: cors });
      if (!['pending', 'accepted', 'scheduled'].includes(challenge.status)) {
        return new Response(JSON.stringify({ error: 'Challenge cannot be washed at this stage.' }), { status: 409, headers: cors });
      }

      // The challenge row stays at 'scheduled' for the entire life of the match —
      // only matches.status advances — so the check above does not on its own
      // prove the match has not been played. Without this, a player losing 4-1
      // could tap "Couldn't agree" and erase the match: no loss, no rank change,
      // no cooldown, and since a wash is now refunded, no cost at all.
      const { data: existingMatch, error: matchLookupError } = await supabase
        .from('matches')
        .select('id, status')
        .eq('challenge_id', challenge_id)
        .maybeSingle();
      if (matchLookupError) throw matchLookupError;
      if (existingMatch && existingMatch.status !== 'scheduled') {
        return new Response(JSON.stringify({ error: 'This match is already under way. Submit the result, or ask an admin if something went wrong.' }), { status: 409, headers: cors });
      }

      // A wash is a failure to agree on a time, so it only exists once there was
      // a time to agree on. Washing a still-pending challenge is really the
      // challenger walking away, and is recorded as such — only a true wash is
      // refunded against the weekly challenge limit.
      const cancelReason = challenge.status === 'pending' ? 'withdrawn' : 'wash';

      // Cancel with no penalties — no cooldowns, no rank changes
      const { data: washed, error: cancelError } = await supabase
        .from('challenges')
        .update({ status: 'cancelled', cancel_reason: cancelReason })
        .eq('id', challenge_id)
        .in('status', ['pending', 'accepted', 'scheduled'])
        .select('id');
      if (cancelError) throw cancelError;
      // Someone else moved the challenge on between the read and this write.
      // Stop here rather than announcing a wash that did not happen.
      if (!washed?.length) {
        return new Response(JSON.stringify({ error: 'This challenge has already moved on. Refresh and take another look.' }), { status: 409, headers: cors });
      }

      // Close the unplayed match, if one was created. Scoped to 'scheduled' so a
      // match that started in the moment between the check above and this write
      // survives.
      const { error: matchCancelError } = await supabase.from('matches').update({ status: 'resolved' }).eq('challenge_id', challenge_id).eq('status', 'scheduled');
      if (matchCancelError) throw matchCancelError;

      const { data: challengerPlayer } = await supabase.from('players').select('full_name').eq('id', challenge.challenger_id).single();
      const { data: challengedPlayer } = await supabase.from('players').select('full_name').eq('id', challenge.challenged_id).single();
      const { error: washActivityError } = await supabase.from('activity_feed').insert({
        event_type: 'challenge_cancelled',
        headline: `${callerPlayer.full_name} declared a scheduling wash on ${challengerPlayer?.full_name ?? '?'} vs ${challengedPlayer?.full_name ?? '?'}.`,
        detail: `${challenge.discipline} · race to ${challenge.race_length} · no ranking change, no cooldown`,
        actor_player_id: callerPlayer.id,
      });
      if (washActivityError) throw washActivityError;

      const otherPlayerId = isChallenger ? challenge.challenged_id : challenge.challenger_id;
      const { error: washNotifyError } = await supabase.from('notifications').insert({
        player_id: otherPlayerId,
        type: 'challenge_expired',
        title: '🤝 Challenge washed',
        body: `${callerPlayer.full_name} called your ${challenge.discipline} challenge a wash. No penalty for either of you.`,
        reference_id: challenge_id,
        reference_type: 'challenge',
      });
      if (washNotifyError) throw washNotifyError;
      await sendPush(supabase, otherPlayerId, '🤝 Challenge washed', `${callerPlayer.full_name} called your ${challenge.discipline} challenge a wash.`, '/challenges', 'challenge_cancelled');

    } else if (action === 'cancel') {
      // Challenger cancels their own pending challenge
      if (challenge.challenger_id !== callerPlayer.id) return new Response(JSON.stringify({ error: 'Not authorized.' }), { status: 403, headers: cors });
      if (challenge.status !== 'pending') return new Response(JSON.stringify({ error: 'Can only cancel pending challenges.' }), { status: 400, headers: cors });
      // Withdrawing your own challenge still spends it — see countsAgainstWeeklyLimit
      // in create-challenge.
      const { data: withdrawn, error: withdrawError } = await supabase
        .from('challenges')
        .update({ status: 'cancelled', cancel_reason: 'withdrawn' })
        .eq('id', challenge_id)
        .eq('status', 'pending')
        .select('id');
      if (withdrawError) throw withdrawError;
      if (!withdrawn?.length) {
        return new Response(JSON.stringify({ error: 'This challenge has already been answered. Refresh and take another look.' }), { status: 409, headers: cors });
      }

      const { data: challengedPlayer } = await supabase.from('players').select('full_name').eq('id', challenge.challenged_id).single();
      const { error: cancelActivityError } = await supabase.from('activity_feed').insert({
        event_type: 'challenge_cancelled',
        headline: `${callerPlayer.full_name} cancelled their pending ${challenge.discipline} challenge to ${challengedPlayer?.full_name ?? '?'}.`,
        actor_player_id: callerPlayer.id,
      });
      if (cancelActivityError) throw cancelActivityError;

    } else {
      return new Response(JSON.stringify({ error: 'Invalid action.' }), { status: 400, headers: cors });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    // Postgres errors carry constraint, column and table names. Log the real
    // one for us; return something a player can act on.
    console.error(`[respond-to-challenge] unhandled: ${e instanceof Error ? e.message : String(e)}`);
    return new Response(JSON.stringify({ error: 'Something went wrong on our end. Please try again.' }), { status: 500, headers: cors });
  }
});
