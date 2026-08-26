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
    // Until this existed the answer was "whoever asks first". A claimed profile
    // accepts and declines challenges -- declining is a forfeit that hands over
    // a ladder spot -- and submits results, so taking somebody else's name is
    // not a cosmetic prank. An admin puts the expected address on the roster;
    // this is where it is checked.
    //
    // No roster email means no claim, deliberately. An unclaimed name with
    // nothing on file is exactly the one an impostor would pick, so "not set
    // up yet" has to fail closed. The admin invite path in add-player links
    // profile_id directly and does not come through here, so this refuses
    // nobody who was invited properly.
    const { data: rosterRow, error: rosterError } = await supabase
      .from('player_roster_emails')
      .select('email')
      .eq('player_id', player_id)
      .maybeSingle();

    if (rosterError) {
      console.error(`[claim] roster lookup failed for player ${player_id}: ${rosterError.message}`);
      return new Response(JSON.stringify({ error: 'Could not check that profile. Please try again.' }), { status: 500, headers: corsHeaders });
    }

    if (!rosterRow?.email) {
      return new Response(JSON.stringify({
        error: `${targetPlayer.full_name} is not set up for self sign-up yet. Ask a TOC admin to add your email to the roster, or to send you an invite.`,
      }), { status: 403, headers: corsHeaders });
    }

    // Both sides lowercased and trimmed. The roster column is CHECK-constrained
    // to already be lowercase, but the address on the token comes from whatever
    // the member typed into the sign-in box.
    const signedInEmail = (user.email ?? '').trim().toLowerCase();
    if (!signedInEmail || signedInEmail !== rosterRow.email) {
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
      // Records that the roster gate was applied, not just that a claim
      // happened. If this rule is ever loosened, the audit trail shows which
      // claims were checked and which were not.
      detail: { player_name: targetPlayer.full_name, matched_roster_email: true },
    });
    if (auditError) console.error(`[claim] audit insert failed for player ${player_id}: ${auditError.message}`);

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    // Postgres errors carry constraint, column and table names. Log the real
    // one for us; return something a player can act on.
    console.error(`[claim-player] unhandled: ${e instanceof Error ? e.message : String(e)}`);
    return new Response(JSON.stringify({ error: 'Something went wrong on our end. Please try again.' }), { status: 500, headers: corsHeaders });
  }
});
