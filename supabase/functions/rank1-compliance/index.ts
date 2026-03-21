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

    // Must be called by an admin
    const { data: { user } } = await supabase.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', ''));
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Admin access required.' }), { status: 403, headers: cors });
    }

    // Get current #1 player
    const { data: rank1 } = await supabase
      .from('rankings')
      .select('player_id, rank1_since')
      .eq('position', 1)
      .single();

    if (!rank1) return new Response(JSON.stringify({ error: 'No #1 player found.' }), { headers: cors });
    if (!rank1.rank1_since) {
      // Set rank1_since to now if missing
      await supabase.from('rankings').update({ rank1_since: new Date().toISOString() }).eq('player_id', rank1.player_id);
      return new Response(JSON.stringify({ message: 'rank1_since initialized.', top5_matches: 0, days_elapsed: 0 }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const rank1Since = new Date(rank1.rank1_since);
    const now = new Date();
    const daysSince = (now.getTime() - rank1Since.getTime()) / (1000 * 3600 * 24);

    // Count top-5 matches in window
    const { data: top5 } = await supabase
      .from('rankings')
      .select('player_id')
      .gte('position', 2)
      .lte('position', 5);
    const top5Ids = (top5 ?? []).map((r: { player_id: string }) => r.player_id);

    let matchCount = 0;
    if (top5Ids.length > 0) {
      const { count } = await supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'confirmed')
        .gte('completed_at', rank1.rank1_since)
        .or(
          `and(player1_id.eq.${rank1.player_id},player2_id.in.(${top5Ids.join(',')})),` +
          `and(player2_id.eq.${rank1.player_id},player1_id.in.(${top5Ids.join(',')}))`
        );
      matchCount = count ?? 0;
    }

    const { data: rank1Player } = await supabase.from('players').select('id, full_name').eq('id', rank1.player_id).single();

    // Apply penalty if requested or if window expired
    const { enforce } = await req.json().catch(() => ({ enforce: false }));

    if (enforce || daysSince >= 30) {
      if (matchCount < 2) {
        // Penalty: move #1 to #10, cascade #2–#9 up
        const { data: affectedRanks } = await supabase
          .from('rankings')
          .select('id, player_id, position')
          .gte('position', 2)
          .lte('position', 10)
          .order('position');

        if (affectedRanks) {
          for (const r of affectedRanks) {
            await supabase.from('rankings').update({
              previous_position: r.position,
              position: r.position - 1,
            }).eq('id', r.id);
          }
        }

        await supabase.from('rankings').update({
          previous_position: 1,
          position: 10,
          rank1_since: null,
        }).eq('player_id', rank1.player_id);

        if (rank1Player) {
          await supabase.from('notifications').insert({
            player_id: rank1Player.id,
            type: 'rank1_penalty',
            title: '📉 Rank 1 obligation not met',
            body: 'You did not play a top-5 opponent twice in your 30-day window. You have been moved to #10.',
            reference_type: 'ranking',
          });

          await supabase.from('activity_feed').insert({
            event_type: 'rank1_penalty',
            headline: `${rank1Player.full_name} was moved to #10 for failing the #1 top-5 obligation.`,
            actor_player_id: rank1.player_id,
          });
        }

        return new Response(JSON.stringify({
          penalized: true,
          player: rank1Player?.full_name,
          top5_matches: matchCount,
          days_elapsed: Math.floor(daysSince),
        }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({
      penalized: false,
      player: rank1Player?.full_name,
      top5_matches: matchCount,
      days_elapsed: Math.floor(daysSince),
      days_remaining: Math.max(0, Math.floor(30 - daysSince)),
      compliant: matchCount >= 2,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
