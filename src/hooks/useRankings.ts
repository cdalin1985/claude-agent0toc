import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { RankedPlayer, Player, Ranking, PlayerMetrics, PlayerSeasonStats } from '../types/database';

export function useRankings() {
  return useQuery<RankedPlayer[]>({
    queryKey: ['rankings'],
    queryFn: async () => {
      const [playersRes, rankingsRes, metricsRes, statsRes] = await Promise.all([
        // players_public, not players. The ladder payload is where the profile
        // detail columns actually reach other members — every ranked player's
        // row, refetched every 30 seconds — so it is where the "Profile
        // Details" toggle has to be enforced. Redacting in the component (which
        // is what PlayerPage did) hid the values from the page while still
        // sending them to the browser. Same columns, same types; the view nulls
        // what the owner asked to keep back, and nothing for the owner.
        //
        // No is_active filter. An inactive member keeps their ranking row, so
        // filtering them out here did not free their number — it dropped them
        // from `rankings` and every consumer lost them with it. The ladder
        // rendered 66 players as 64 rows whose numbering jumped 8 → 10 and
        // 32 → 34; PlayerPage could not open their profile; MatchPage labelled
        // a finished match against them "Player 1" at rank #1. The inactive
        // branches those pages already carry — InactivePlayerBanner, the
        // disabled Send Challenge button — were unreachable for the same
        // reason. Activity is a presentation concern, so it belongs to the
        // pages below, not to the fetch every one of them shares.
        supabase.from('players_public').select('*'),
        supabase.from('rankings').select('*').order('position'),
        supabase.from('player_reference_metrics').select('*'),
        supabase.from('player_season_stats').select('*'),
      ]);

      // Surface fetch failures so pages can show an error state instead of an
      // empty (and misleading) list.
      if (playersRes.error) throw playersRes.error;
      if (rankingsRes.error) throw rankingsRes.error;

      const players  = (playersRes.data  ?? []) as Player[];
      const rankings = (rankingsRes.data ?? []) as Ranking[];
      const metrics  = (metricsRes.data  ?? []) as PlayerMetrics[];
      const stats    = (statsRes.data    ?? []) as PlayerSeasonStats[];

      return rankings.map((r) => ({
        player:  players.find((p) => p.id === r.player_id)!,
        ranking: r,
        metrics: metrics.find((m) => m.player_id === r.player_id) ?? null,
        stats:   stats.find((s)   => s.player_id === r.player_id) ?? null,
      })).filter((rp) => rp.player);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
