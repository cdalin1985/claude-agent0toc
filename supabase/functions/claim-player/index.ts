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
    if (!player_id) return new Response(JSON.stringify({ error: 'player_id required' }), { status: 400, headers: corsHeaders });

    // Check user hasn't already claimed
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (existingPlayer) return new Response(JSON.stringify({ error: 'You have already claimed a player profile.' }), { status: 409, headers: corsHeaders });

    // Check target player is unclaimed. This is only for a friendly up-front
    // message — the claim below re-checks atomically and is the real gate.
    const { data: targetPlayer } = await supabase
      .from('players')
      .select('id, profile_id, full_name')
      .eq('id', player_id)
      .maybeSingle();
    if (!targetPlayer) return new Response(JSON.stringify({ error: 'Player not found.' }), { status: 404, headers: corsHeaders });
    if (targetPlayer.profile_id) return new Response(JSON.stringify({ error: 'This player has already been claimed.' }), { status: 409, headers: corsHeaders });

    // Is this name yours?
    //
    // Two answers are acceptable, and which one applies is the admin's choice
    // per player. If an address is on the roster the claim has to match it --
    // an admin has said who that name belongs to, and that is binding. If
    // nothing is on file the claim goes through, because requiring an address
    // up front means collecting 66 of them before anybody can sign in, and TOC
    // onboards at the table rather than by spreadsheet.
    //
    // Failing open is a deliberate trade, not an oversight. It is paid for by
    // making the claim loud instead of silent: an audit row recording whether
    // the roster was checked, a line in the public activity feed, and a
    // notification to every admin -- who can undo it from the Admin tab with
    // Release claim. Prevention for the names an admin has pinned; detection
    // and a fast reversal for the rest.
    const { data: rosterRow, error: rosterError } = await supabase
      .from('player_roster_emails')
      .select('email')
      .eq('player_id', player_id)
      .maybeSingle();

    if (rosterError) {
      // A failed read must not be read as "no address on file". That would turn
      // a transient database blip into an open door on a pinned name.
      console.error(`[claim] roster lookup failed for player ${player_id}: ${rosterError.message}`);
      return new Response(JSON.stringify({ error: 'Could not check that profile. Please try again.' }), { status: 500, headers: corsHeaders });
    }

    // Both sides lowercased and trimmed. The roster column is CHECK-constrained
    // to already be lowercase, but the address on the token comes from whatever
    // the member typed into the sign-in box.
    const signedInEmail = (user.email ?? '').trim().toLowerCase();
    const isPinned = Boolean(rosterRow?.email);

    if (isPinned && (!signedInEmail || signedInEmail !== rosterRow.email)) {
      // Deliberately does not say which address is on file. Telling an
      // unrecognised caller "we expected dave@..." hands out a member's email
      // to anyone who can guess a name off the public ladder.
      console.warn(`[claim] refused: ${signedInEmail || '(no email on token)'} does not match the roster for player ${player_id}`);
      return new Response(JSON.stringify({
        error: `That is not the email TOC has on file for ${targetPlayer.full_name}. Sign in with the address you gave the league, or ask an admin to update it.`,
      }), { status: 403, headers: corsHeaders });
    }

    // Claim it. `.is('profile_id', null)` makes the check and the write a single
    // statement, so two people tapping the same name cannot both pass. Previously
    // this write's result was discarded and success was reported unconditionally,
    // so any failure — a lost connection included — told the player they had
    // claimed a profile they were not actually linked to.
    const { data: claimed, error: claimError } = await supabase
      .from('players')
      .update({ profile_id: user.id })
      .eq('id', player_id)
      .is('profile_id', null)
      .select('id')
      .maybeSingle();

    if (claimError) {
      console.error(`[claim] write failed for player ${player_id}: ${claimError.message}`);
      return new Response(JSON.stringify({ error: 'Could not claim that profile. Please try again.' }), { status: 500, headers: corsHeaders });
    }
    // No error but nothing updated: the row stopped being unclaimed between the
    // check above and this write.
    if (!claimed) {
      return new Response(JSON.stringify({ error: 'This player was just claimed by someone else. Please pick another name.' }), { status: 409, headers: corsHeaders });
    }

    // Log audit event. Never fail the claim over the audit trail.
    const { error: auditError } = await supabase.from('audit_events').insert({
      actor_profile_id: user.id,
      action: 'claim_player',
      target_type: 'player',
      target_id: player_id,
      // Records whether the roster gate applied, not just that a claim
      // happened. Unpinned names are claimable by any signed-in account, so
      // "which claims were actually checked" is the question to answer later.
      detail: {
        player_name: targetPlayer.full_name,
        matched_roster_email: isPinned,
        claimed_by_email: signedInEmail || null,
      },
    });
    if (auditError) console.error(`[claim] audit insert failed for player ${player_id}: ${auditError.message}`);

    // Say it out loud. An unpinned claim is not checked against anything, so
    // the safety net is that a wrong one is visible immediately -- to the whole
    // league in the feed, and to admins as a notification -- rather than
    // surfacing weeks later as a forfeited ladder spot.
    const { error: feedError } = await supabase.from('activity_feed').insert({
      event_type: 'player_claimed',
      headline: `${targetPlayer.full_name} claimed their profile.`,
      detail: isPinned
        ? 'Matched the sign-up email on file.'
        : 'Self sign-up · not checked against a sign-up email.',
      actor_player_id: player_id,
    });
    if (feedError) console.error(`[claim] activity insert failed for player ${player_id}: ${feedError.message}`);

    // Notify every admin who has a player row of their own. notification_category
    // returns NULL for this type and player_accepts_notification treats an
    // unknown category as "deliver", so this cannot be switched off in
    // preferences -- which is the point of an alert.
    const { data: adminProfiles, error: adminLookupError } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'super_admin']);

    if (adminLookupError) {
      console.error(`[claim] admin lookup failed for player ${player_id}: ${adminLookupError.message}`);
    } else if (adminProfiles?.length) {
      const { data: adminPlayers, error: adminPlayerError } = await supabase
        .from('players')
        .select('id')
        .in('profile_id', adminProfiles.map((p: { id: string }) => p.id));

      if (adminPlayerError) {
        console.error(`[claim] admin player lookup failed for player ${player_id}: ${adminPlayerError.message}`);
      } else if (adminPlayers?.length) {
        const rows = adminPlayers
          // The claimant does not need telling about their own claim.
          .filter((a: { id: string }) => a.id !== player_id)
          .map((a: { id: string }) => ({
            player_id: a.id,
            type: 'player_claimed',
            title: isPinned ? 'Profile claimed' : 'Profile claimed — not verified',
            body: isPinned
              ? `${targetPlayer.full_name} signed up and matched the email on file.`
              : `${targetPlayer.full_name} was claimed by ${signedInEmail || 'an account with no email'}, with no sign-up email on file to check it against. Release the claim from the Admin tab if that is not them.`,
            reference_type: 'player',
          }));

        if (rows.length) {
          const { error: notifyError } = await supabase.from('notifications').insert(rows);
          if (notifyError) console.error(`[claim] admin notify failed for player ${player_id}: ${notifyError.message}`);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    // Postgres errors carry constraint, column and table names. Log the real
    // one for us; return something a player can act on.
    console.error(`[claim-player] unhandled: ${e instanceof Error ? e.message : String(e)}`);
    return new Response(JSON.stringify({ error: 'Something went wrong on our end. Please try again.' }), { status: 500, headers: corsHeaders });
  }
});
