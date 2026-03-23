import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Swords, Trophy, TrendingUp, AlertTriangle, DollarSign } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { useRankings } from '../hooks/useRankings';
import { supabase } from '../lib/supabase';
import { PoolBall } from '../components/PoolBall';
import { GlassCard } from '../components/GlassCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import type { ActivityFeedItem, Notification } from '../types/database';
import { formatDistanceToNow } from '../utils/time';

export default function HomePage() {
  const navigate   = useNavigate();
  const { player, profile } = useAuthStore();
  const { data: rankings = [] } = useRankings();

  const myRanking = rankings.find((r) => r.player.id === player?.id);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications', 'preview', player?.id],
    queryFn: async () => {
      if (!player) return [];
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('player_id', player.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(3);
      return data ?? [];
    },
    enabled: !!player,
  });

  const { data: feed = [] } = useQuery<ActivityFeedItem[]>({
    queryKey: ['activity-feed', 'preview'],
    queryFn: async () => {
      const { data } = await supabase
        .from('activity_feed')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  // #1 compliance info (only relevant if player is ranked #1)
  const isRank1 = myRanking?.ranking.position === 1;
  const { data: rank1Compliance } = useQuery({
    queryKey: ['rank1-compliance', player?.id],
    queryFn: async () => {
      if (!player || !isRank1) return null;
      // Get rank1_since and count top-5 matches
      const { data: rankRow } = await supabase
        .from('rankings')
        .select('rank1_since')
        .eq('player_id', player.id)
        .single();
      if (!rankRow?.rank1_since) return null;

      const rank1Since = new Date(rankRow.rank1_since);
      const daysSince = (Date.now() - rank1Since.getTime()) / (1000 * 3600 * 24);

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
          .gte('completed_at', rankRow.rank1_since)
          .or(
            `and(player1_id.eq.${player.id},player2_id.in.(${top5Ids.join(',')})),` +
            `and(player2_id.eq.${player.id},player1_id.in.(${top5Ids.join(',')}))`
          );
        matchCount = count ?? 0;
      }

      return {
        daysElapsed: Math.floor(daysSince),
        daysRemaining: Math.max(0, Math.floor(30 - daysSince)),
        matchCount,
        compliant: matchCount >= 2,
      };
    },
    enabled: !!player && isRank1,
    refetchInterval: 60000,
  });

  const myStats = myRanking?.stats;

  if (!player || !myRanking) {
    return (
      <div className="min-h-screen px-4 pt-8 space-y-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  const winPct = myStats && myStats.matches_played > 0
    ? Math.round((myStats.wins / myStats.matches_played) * 100)
    : 0;

  return (
    <div className="min-h-screen px-4 pt-8 pb-4 space-y-5">
      {/* #1 compliance banner */}
      {isRank1 && rank1Compliance && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard className={`p-4 border ${rank1Compliance.compliant ? 'border-[#22C55E]/30' : rank1Compliance.daysRemaining <= 5 ? 'border-[#EF4444]/40' : 'border-[#F59E0B]/30'}`}>
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className={rank1Compliance.compliant ? 'text-[#22C55E]' : rank1Compliance.daysRemaining <= 5 ? 'text-[#EF4444]' : 'text-[#F59E0B]'} />
              <div className="flex-1">
                <div className="font-[Outfit] font-semibold text-[#E8E2D6] text-sm">
                  {rank1Compliance.compliant ? '✅ #1 Obligation Met' : `#1 Obligation — ${rank1Compliance.matchCount}/2 top-5 matches`}
                </div>
                <div className="text-[#9CA3AF] text-xs font-[Outfit] mt-0.5">
                  {rank1Compliance.compliant
                    ? `Window resets in ${rank1Compliance.daysRemaining} days`
                    : `${rank1Compliance.daysRemaining} days left to play a top-5 opponent or you drop to #10`}
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Player card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <GlassCard className="p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#C62828]/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-4">
            <PoolBall position={myRanking.ranking.position} size={64} />
            <div className="flex-1 min-w-0">
              <div className="font-[Bebas_Neue] text-3xl text-[#E8E2D6] leading-tight truncate">
                {profile?.display_name ?? player.full_name}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="font-[JetBrains_Mono] font-bold text-2xl" style={{ color: '#C62828' }}>
                  #{myRanking.ranking.position}
                </span>
                {myRanking.metrics?.fargo_rating && (
                  <span className="text-[#9CA3AF] font-[JetBrains_Mono] text-sm">
                    FR {myRanking.metrics.fargo_rating}
                  </span>
                )}
                {myStats?.best_rank_achieved && myStats.best_rank_achieved < myRanking.ranking.position && (
                  <Badge variant="default">Best #{myStats.best_rank_achieved}</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-5 pt-4 border-t border-white/5">
            {[
              { label: 'Wins',   value: myStats?.wins ?? 0,           color: '#22C55E' },
              { label: 'Losses', value: myStats?.losses ?? 0,         color: '#EF4444' },
              { label: 'Win %',  value: `${winPct}%`,                 color: '#E8E2D6' },
              { label: 'Streak', value: myStats?.current_streak ?? 0, color: (myStats?.current_streak ?? 0) > 0 ? '#22C55E' : '#9CA3AF' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="font-[JetBrains_Mono] font-bold text-xl" style={{ color: s.color }}>
                  {s.value}
                </div>
                <div className="text-[#6B7280] text-xs font-[Outfit] mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      </motion.div>

      {/* Quick actions */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.4 }}>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="primary" size="lg" onClick={() => navigate('/rankings?challenge=1')}>
            <Swords size={18} /> Challenge
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate('/matches')}>
            <Trophy size={18} /> My Matches
          </Button>
        </div>
      </motion.div>

      {/* Notifications preview */}
      {notifications.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }}>
          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-[Bebas_Neue] text-xl text-[#E8E2D6]">
                Alerts <span className="text-[#C62828]">({notifications.length})</span>
              </h2>
              <button onClick={() => navigate('/notifications')} className="text-[#C62828] text-xs font-[Outfit]">
                View all →
              </button>
            </div>
            <div className="space-y-2">
              {notifications.map((n) => (
                <div key={n.id} className="flex items-start gap-2 py-2 border-b border-white/5 last:border-0">
                  <div className="w-2 h-2 rounded-full bg-[#C62828] mt-1.5 shrink-0" />
                  <div>
                    <div className="text-sm font-[Outfit] font-medium text-[#E8E2D6]">{n.title}</div>
                    <div className="text-xs text-[#9CA3AF] font-[Outfit] mt-0.5">{n.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Quick links — Treasury + Activity */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.4 }}>
        <div className="grid grid-cols-2 gap-3">
          <GlassCard className="p-4" hover onClick={() => navigate('/activity')}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-[#9CA3AF]" />
              <span className="font-[Outfit] font-semibold text-[#E8E2D6] text-sm">Activity</span>
            </div>
            <div className="text-[#6B7280] text-xs font-[Outfit]">Full league journal</div>
          </GlassCard>
          <GlassCard className="p-4" hover onClick={() => navigate('/treasury')}>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="text-[#9CA3AF]" />
              <span className="font-[Outfit] font-semibold text-[#E8E2D6] text-sm">Treasury</span>
            </div>
            <div className="text-[#6B7280] text-xs font-[Outfit]">League funds</div>
          </GlassCard>
        </div>
      </motion.div>

      {/* Activity feed */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}>
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-[#9CA3AF]" />
              <h2 className="font-[Bebas_Neue] text-xl text-[#E8E2D6]">League Activity</h2>
            </div>
            <button onClick={() => navigate('/activity')} className="text-[#C62828] text-xs font-[Outfit]">
              View all →
            </button>
          </div>
          {feed.length === 0 ? (
            <p className="text-[#6B7280] text-sm font-[Outfit] py-4 text-center">
              No activity yet. Be the first to challenge someone!
            </p>
          ) : (
            <div className="space-y-3">
              {feed.map((item) => (
                <div key={item.id} className="flex gap-2 items-start py-1.5 border-b border-white/5 last:border-0">
                  <div className="text-lg shrink-0">
                    {item.event_type === 'challenge_issued'  ? '⚔️'
                      : item.event_type === 'challenge_accepted' ? '✅'
                      : item.event_type === 'match_confirmed'   ? '🏆'
                      : item.event_type === 'rank_change'       ? '📈'
                      : item.event_type === 'rank1_penalty'     ? '📉'
                      : '🎱'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-[Outfit] text-[#E8E2D6] leading-snug">{item.headline}</div>
                    <div className="text-[#6B7280] text-xs font-[Outfit] mt-0.5">
                      {formatDistanceToNow(item.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </motion.div>
    </div>
  );
}
