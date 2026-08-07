/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// deno-lint-ignore-file no-explicit-any
// Kept in sync with supabase/functions/_shared/sendPush.ts. This function is
// deployed as a standalone bundle, so it carries its own copy rather than
// importing across directories.
function vapidDetails(): { subject: string; publicKey: string; privateKey: string } | null {
  const rawSubject = Deno.env.get('VAPID_SUBJECT') ?? '';
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const missing = [rawSubject ? null : 'VAPID_SUBJECT', publicKey ? null : 'VAPID_PUBLIC_KEY', privateKey ? null : 'VAPID_PRIVATE_KEY'].filter((n): n is string => n !== null);
  if (missing.length > 0) {
    console.error(`[push] NOT CONFIGURED — missing ${missing.join(', ')}. No notification was sent.`);
    return null;
  }
  const subject = /^(mailto:|https?:)/i.test(rawSubject) ? rawSubject : `mailto:${rawSubject}`;
  return { subject, publicKey, privateKey };
}

// Never throws — push must not break challenge creation. But every exit path
// logs, because a swallowed failure is indistinguishable from a delivery.
async function sendPush(supabase: any, playerId: string, title: string, body: string, url: string): Promise<void> {
  try {
    const { data: row, error } = await supabase.from('push_subscriptions').select('subscription').eq('player_id', playerId).maybeSingle();
    if (error) { console.error(`[push] could not read subscription for player ${playerId}: ${error.message}`); return; }
    if (!row?.subscription) { console.info(`[push] player ${playerId} has no push subscription — skipped.`); return; }
    const vapid = vapidDetails();
    if (!vapid) return;
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    await webpush.sendNotification(row.subscription, JSON.stringify({ title, body, url }));
    console.info(`[push] delivered to player ${playerId}: ${title}`);
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.statusCode === 410) {
      console.warn(`[push] subscription for player ${playerId} is gone (${e.statusCode}) — removing it.`);
      await supabase.from('push_subscriptions').delete().eq('player_id', playerId);
      return;
    }
    console.error(`[push] delivery failed for player ${playerId} (status ${e?.statusCode ?? 'none'}): ${e?.body ?? e?.message ?? String(e)}`);
  }
}

function canChallenge(
  myPos: number,
  theirPos: number,
  isFirstChallenge: boolean,
  challengeRange: number,
  firstChallengeRange: number,
): string | null {
  if (myPos === theirPos) return 'You cannot challenge yourself.';
  if (myPos === 1) return null;

  if (myPos <= 10) {
    if (Math.abs(myPos - theirPos) > challengeRange) {
      return `Top-10 players can only challenge within ${challengeRange} spots up or down.`;
    }
    return null;
  }

  if (isFirstChallenge) {
    if (theirPos >= myPos) return 'Your first challenge must be against someone ranked above you.';
    if ((myPos - theirPos) > firstChallengeRange) {
      return `Your first challenge can only be up to ${firstChallengeRange} spots above you.`;
    }
    return null;
  }

  if (theirPos >= myPos) return 'You can only challenge players ranked above you.';
  if ((myPos - theirPos) > challengeRange) {
    return `You can only challenge players up to ${challengeRange} spots above you.`;
  }
  return null;
}

/**
 * Whether a challenge consumes one of the challenger's weekly slots.
 *
 * README: "If you can't agree on a time: The challenge is a wash. No penalties
 * for either player." Losing a weekly challenge to a wash is a penalty, so a
 * wash — and a match ruled overdue, which is the same outcome reached by the
 * clock rather than by agreement — does not count. Neither does a challenge that
 * expired unanswered: the challenger did nothing wrong and got no match.
 *
 * A challenge the challenger withdrew before it was accepted DOES count.
 * Otherwise the limit is unenforceable — you could create and withdraw all day.
 */
function countsAgainstWeeklyLimit(row: { status: string; cancel_reason: string | null }): boolean {
  if (row.status === 'expired') return false;
  if (row.status === 'cancelled' && (row.cancel_reason === 'wash' || row.cancel_reason === 'overdue')) return false;
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const authHeader = req.headers.get('Authorization');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader?.replace('Bearer ', ''));
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { challenged_player_id, discipline, race_length } = await req.json();

    const { data: settings } = await supabase
      .from('league_settings')
      .select('min_race, max_race, challenge_range, first_challenge_range, challenge_expiry_days, challenge_weekly_limit')
      .single();

    const minRace = settings?.min_race ?? 6;
    const maxRace = settings?.max_race;
    const challengeRange = settings?.challenge_range ?? 5;
    const firstChallengeRange = settings?.first_challenge_range ?? 10;
    const challengeExpiryDays = settings?.challenge_expiry_days ?? 7;
    const weeklyLimit = settings?.challenge_weekly_limit ?? 2;

    const validDisciplines = ['8 Ball', '9 Ball', '10 Ball'];
    if (!validDisciplines.includes(discipline)) return new Response(JSON.stringify({ error: 'Invalid discipline.' }), { headers: corsHeaders });
    if (!Number.isInteger(race_length) || race_length < minRace) return new Response(JSON.stringify({ error: `Race length must be at least ${minRace}.` }), { headers: corsHeaders });
    if (Number.isInteger(maxRace) && race_length > maxRace) return new Response(JSON.stringify({ error: `Race length cannot exceed ${maxRace}.` }), { headers: corsHeaders });

    const { data: challenger } = await supabase.from('players').select('id, is_active').eq('profile_id', user.id).single();
    if (!challenger) return new Response(JSON.stringify({ error: 'You must claim a player profile first.' }), { headers: corsHeaders });
    if (!challenger.is_active) return new Response(JSON.stringify({ error: 'Your account is inactive.' }), { headers: corsHeaders });
    if (challenger.id === challenged_player_id) return new Response(JSON.stringify({ error: 'You cannot challenge yourself.' }), { headers: corsHeaders });

    const { data: challenged } = await supabase.from('players').select('id, is_active').eq('id', challenged_player_id).single();
    if (!challenged) return new Response(JSON.stringify({ error: 'That player does not exist.' }), { headers: corsHeaders });
    if (!challenged.is_active) return new Response(JSON.stringify({ error: 'That player is currently inactive and cannot be challenged.' }), { headers: corsHeaders });

    const [challengerRankRes, challengedRankRes] = await Promise.all([
      supabase.from('rankings').select('position').eq('player_id', challenger.id).single(),
      supabase.from('rankings').select('position').eq('player_id', challenged_player_id).single(),
    ]);
    if (!challengerRankRes.data || !challengedRankRes.data) return new Response(JSON.stringify({ error: 'Could not retrieve rankings.' }), { headers: corsHeaders });

    const myPos = challengerRankRes.data.position;
    const theirPos = challengedRankRes.data.position;

    await supabase.rpc('expire_stale_challenges');

    const { count: priorChallenges } = await supabase.from('challenges').select('id', { count: 'exact', head: true }).eq('challenger_id', challenger.id);
    const isFirstChallenge = (priorChallenges ?? 0) === 0;

    const eligibilityError = canChallenge(myPos, theirPos, isFirstChallenge, challengeRange, firstChallengeRange);
    if (eligibilityError) return new Response(JSON.stringify({ error: eligibilityError }), { headers: corsHeaders });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: recentChallenges, error: weeklyError } = await supabase
      .from('challenges')
      .select('status, cancel_reason')
      .eq('challenger_id', challenger.id)
      .gte('created_at', sevenDaysAgo);
    if (weeklyError) {
      console.error(`[create-challenge] weekly limit check failed for player ${challenger.id}: ${weeklyError.message}`);
      return new Response(JSON.stringify({ error: 'Could not check your weekly challenge count. Please try again.' }), { status: 500, headers: corsHeaders });
    }
    const weeklyCount = (recentChallenges ?? []).filter(countsAgainstWeeklyLimit).length;
    if (weeklyCount >= weeklyLimit) return new Response(JSON.stringify({ error: `You have reached the weekly challenge limit (${weeklyLimit} per 7 days).` }), { headers: corsHeaders });

    const { data: existingOut } = await supabase.from('challenges').select('id').eq('challenger_id', challenger.id).in('status', ['pending', 'accepted', 'scheduled', 'in_progress']).maybeSingle();
    if (existingOut) return new Response(JSON.stringify({ error: 'You already have an active outgoing challenge.' }), { headers: corsHeaders });

    const { data: existingIn } = await supabase.from('challenges').select('id').eq('challenged_id', challenged_player_id).in('status', ['pending', 'accepted', 'scheduled', 'in_progress']).maybeSingle();
    if (existingIn) return new Response(JSON.stringify({ error: 'That player already has an active challenge they must resolve first.' }), { headers: corsHeaders });

    const now = new Date().toISOString();
    const { data: myCooldown, error: cooldownError } = await supabase.from('cooldowns').select('expires_at').eq('player_id', challenger.id).eq('type', 'post_match').gt('expires_at', now).maybeSingle();
    if (cooldownError) {
      console.error(`[create-challenge] cooldown check failed for player ${challenger.id}: ${cooldownError.message}`);
      return new Response(JSON.stringify({ error: 'Could not check your cooldown status. Please try again.' }), { status: 500, headers: corsHeaders });
    }
    // README scopes the post-match cooldown to challenging UP — "wait 24 hours
    // before challenging up again" — and separately grants top-10 players the
    // right to challenge down 5 spots. Blocking a downward challenge would take
    // away a challenge the rulebook gives you.
    if (myCooldown && theirPos < myPos) return new Response(JSON.stringify({ error: `You are in a post-match cooldown and cannot challenge up until ${new Date(myCooldown.expires_at).toLocaleString()}. You can still challenge down.` }), { headers: corsHeaders });

    const expiresAt = new Date(Date.now() + challengeExpiryDays * 24 * 3600 * 1000).toISOString();
    const { data: challenge, error: insertErr } = await supabase.from('challenges').insert({ challenger_id: challenger.id, challenged_id: challenged_player_id, discipline, race_length, status: 'pending', expires_at: expiresAt }).select().single();
    if (insertErr) throw insertErr;

    const [{ data: challengerStats }, { data: challengedStats }] = await Promise.all([
      supabase.from('player_season_stats').select('challenges_issued').eq('player_id', challenger.id).single(),
      supabase.from('player_season_stats').select('challenges_received').eq('player_id', challenged_player_id).single(),
    ]);
    await Promise.all([
      challengerStats ? supabase.from('player_season_stats').update({ challenges_issued: challengerStats.challenges_issued + 1 }).eq('player_id', challenger.id) : Promise.resolve(),
      challengedStats ? supabase.from('player_season_stats').update({ challenges_received: challengedStats.challenges_received + 1 }).eq('player_id', challenged_player_id) : Promise.resolve(),
    ]);

    await Promise.all([
      supabase.from('player_discipline_stats').upsert({ player_id: challenger.id, discipline }, { onConflict: 'player_id,discipline', ignoreDuplicates: true }),
      supabase.from('player_discipline_stats').upsert({ player_id: challenged_player_id, discipline }, { onConflict: 'player_id,discipline', ignoreDuplicates: true }),
    ]);

    const [dStatsC, dStatsD] = await Promise.all([
      supabase.from('player_discipline_stats').select('challenges_issued').eq('player_id', challenger.id).eq('discipline', discipline).single(),
      supabase.from('player_discipline_stats').select('challenges_received').eq('player_id', challenged_player_id).eq('discipline', discipline).single(),
    ]);
    await Promise.all([
      dStatsC.data ? supabase.from('player_discipline_stats').update({ challenges_issued: dStatsC.data.challenges_issued + 1 }).eq('player_id', challenger.id).eq('discipline', discipline) : Promise.resolve(),
      dStatsD.data ? supabase.from('player_discipline_stats').update({ challenges_received: dStatsD.data.challenges_received + 1 }).eq('player_id', challenged_player_id).eq('discipline', discipline) : Promise.resolve(),
    ]);

    const [{ data: challengerPlayer }, { data: challengedPlayer }] = await Promise.all([
      supabase.from('players').select('full_name').eq('id', challenger.id).single(),
      supabase.from('players').select('full_name').eq('id', challenged_player_id).single(),
    ]);
    await supabase.from('notifications').insert({
      player_id: challenged_player_id,
      type: 'challenge_received',
      title: `${challengerPlayer?.full_name} challenged you!`,
      body: `${discipline} - Race to ${race_length}. You have ${challengeExpiryDays} days to respond.`,
      reference_id: challenge.id,
      reference_type: 'challenge',
    });
    await sendPush(supabase, challenged_player_id, `${challengerPlayer?.full_name} challenged you!`, `${discipline} - Race to ${race_length}. Tap to respond.`, '/challenges');

    await supabase.from('activity_feed').insert({
      event_type: 'challenge_issued',
      headline: `${challengerPlayer?.full_name} challenged ${challengedPlayer?.full_name} to ${discipline}!`,
      detail: `Race to ${race_length} · #${myPos} → #${theirPos} · responds within ${challengeExpiryDays} days`,
      actor_player_id: challenger.id,
    });

    return new Response(JSON.stringify({ challenge_id: challenge.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

