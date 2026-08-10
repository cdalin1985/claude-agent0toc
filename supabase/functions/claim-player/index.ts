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
      detail: { player_name: targetPlayer.full_name },
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
