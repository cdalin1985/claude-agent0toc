// Undo a claim.
//
// claim-player lets a signed-in account take any name that an admin has not
// pinned to a specific address. That is a deliberate trade -- collecting 66
// addresses before anybody can sign in is not how TOC onboards -- and this is
// the other half of it. A claim that turns out to be the wrong person has to be
// reversible in one tap, by an admin, from the Admin tab.
//
// WHY AN EDGE FUNCTION rather than an RPC. guard_privilege_columns raises on
// any change to players.profile_id and bypasses only for the service role or a
// non-PostgREST connection. A SECURITY DEFINER RPC would not help: the guard
// reads request.jwt.claims, which still says 'authenticated' inside one. So the
// write goes the same way the claim itself does -- service role, admin checked
// in here first.

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

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const { data: actorProfile, error: actorError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    // An unreadable profile is not an admin. Fail closed.
    if (actorError) {
      console.error(`[release-claim] actor lookup failed: ${actorError.message}`);
      return json({ error: 'Could not verify your account. Please try again.' }, 500);
    }
    if (!actorProfile || !['admin', 'super_admin'].includes(actorProfile.role)) {
      return json({ error: 'Only admins can release a claim.' }, 403);
    }

    const { player_id } = await req.json().catch(() => ({ player_id: null }));
    if (!player_id || typeof player_id !== 'string') return json({ error: 'player_id required' }, 400);

    const { data: target, error: targetError } = await supabase
      .from('players')
      .select('id, full_name, profile_id')
      .eq('id', player_id)
      .maybeSingle();

    if (targetError) {
      console.error(`[release-claim] player lookup failed for ${player_id}: ${targetError.message}`);
      return json({ error: 'Could not load that profile. Please try again.' }, 500);
    }
    if (!target) return json({ error: 'Player not found.' }, 404);
    if (!target.profile_id) return json({ error: 'That profile is not claimed.' }, 409);

    // Releasing a super_admin's own name is how an admin would lock the league
    // owner out of the tab they would use to undo it. Only another super_admin
    // gets to do that.
    const { data: holderProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', target.profile_id)
      .maybeSingle();

    if (holderProfile?.role === 'super_admin' && actorProfile.role !== 'super_admin') {
      return json({ error: 'Only a super admin can release a super admin profile.' }, 403);
    }

    // `.eq('profile_id', target.profile_id)` makes the read and the write one
    // statement: if somebody else released it in between, this releases nothing
    // rather than clobbering a fresh claim made in the meantime.
    const { data: released, error: releaseError } = await supabase
      .from('players')
      .update({ profile_id: null })
      .eq('id', player_id)
      .eq('profile_id', target.profile_id)
      .select('id')
      .maybeSingle();

    if (releaseError) {
      console.error(`[release-claim] write failed for ${player_id}: ${releaseError.message}`);
      return json({ error: 'Could not release that claim. Please try again.' }, 500);
    }
    if (!released) {
      return json({ error: 'That claim changed while you were looking at it. Reload and try again.' }, 409);
    }

    // Never fail the release over the trail it leaves.
    const { error: auditError } = await supabase.from('audit_events').insert({
      actor_profile_id: user.id,
      action: 'admin_released_claim',
      target_type: 'player',
      target_id: player_id,
      detail: { player_name: target.full_name, released_profile_id: target.profile_id },
    });
    if (auditError) console.error(`[release-claim] audit insert failed for ${player_id}: ${auditError.message}`);

    const { error: feedError } = await supabase.from('activity_feed').insert({
      event_type: 'claim_released',
      headline: `${target.full_name} is unclaimed again.`,
      detail: 'An admin released the account that had claimed this profile.',
      actor_player_id: player_id,
    });
    if (feedError) console.error(`[release-claim] activity insert failed for ${player_id}: ${feedError.message}`);

    return json({ success: true });
  } catch (e) {
    console.error(`[release-claim] unhandled: ${e instanceof Error ? e.message : String(e)}`);
    return json({ error: 'Something went wrong on our end. Please try again.' }, 500);
  }
});
