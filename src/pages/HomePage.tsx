import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Swords, Trophy, TrendingUp, Zap } from 'lucide-react';
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

  // Recent notifications
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

  // Activity feed
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

  // Points leaderboard
  const { data: leaderboard = [] } = useQuery({
    queryKey: ['points-leaderboard'],
    queryFn: async () => {
      const { data } = await supabase
        .from('player_season_stats')
        .select('*, players(full_name)')
        .order('points', { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const myStats = myRanking?.stats;
  const myPoints = myStats?.points ?? 0;
  const myPointsRank = leaderboard.findIndex((l) => l.player_id === player?.id) + 1;

  if (!player || !myRanking) {
    return (
      <div className="min-h-screen px-4 pt-8 space-y-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pt-8 pb-4 space-y-5">
      {/* Player card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <GlassCard className="p-5 relative overflow-hidden">
          {/* Subtle top-right glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#C62828]/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-4">
            <PoolBall position={myRanking.ranking.position} size={64} />
            <div className="flex-1 min-w-0">
              <div className="font-[Bebas_Neue] text-3xl text-[#E8E2D6] leading-tight truncate">
                {profile?.display_name ?? player.full_name}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span
                  className="font-[JetBrains_Mono] font-bold text-2xl"
                  style={{ color: '#C62828' }}
                >
                  #{myRanking.ranking.position}
                </span>
                {myRanking.metrics?.fargo_rating && (
                  <span className="text-[#9CA3AF] font-[JetBrains_Mono] text-sm">
                    FR {myRanking.metrics.fargo_rating}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2 mt-5 pt-4 border-t border-white/5">
            {[
              { label: 'Wins',   value: myStats?.wins ?? 0,    color: '#22C55E' },
              { label: 'Losses', value: myStats?.losses ?? 0,  color: '#EF4444' },
              { label: 'Pts',    value: myPoints,              color: '#D4AF37' },
              { label: 'Streak', value: myStats?.current_streak ?? 0, color: myStats?.current_streak && myStats.current_streak > 0 ? '#22C55E' : '#9CA3AF' },
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

      {/* Points widget */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={18} className="text-[#D4AF37]" />
            <h2 className="font-[Bebas_Neue] text-xl text-[#E8E2D6]">Season Points</h2>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="font-[JetBrains_Mono] font-bold text-4xl text-[#D4AF37]">{myPoints}</div>
              <div className="text-[#9CA3AF] text-xs font-[Outfit] mt-1">
                {myPointsRank > 0 ? `#${myPointsRank} on leaderboard` : 'Not ranked yet'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[#9CA3AF] text-xs font-[Outfit] mb-2">Top scorers</div>
              {leaderboard.slice(0, 3).map((l, i) => (
                <div key={l.player_id} className="flex items-center gap-2 justify-end">
                  <span className="text-[#6B7280] text-xs font-[JetBrains_Mono]">#{i + 1}</span>
                  <span className="text-[#E8E2D6] text-xs font-[Outfit] truncate max-w-[100px]">
                    {(l as { players?: { full_name: string } }).players?.full_name?.split(' ')[0] ?? ''}
                  </span>
                  <span className="text-[#D4AF37] text-xs font-[JetBrains_Mono] font-bold">{l.points}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Activity feed */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.4 }}>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={18} className="text-[#9CA3AF]" />
            <h2 className="font-[Bebas_Neue] text-xl text-[#E8E2D6]">League Activity</h2>
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
                    {item.event_type === 'challenge_issued' ? '⚔️'
                      : item.event_type === 'challenge_accepted' ? '✅'
                      : item.event_type === 'match_confirmed' ? '🏆'
                      : item.event_type === 'rank_change' ? '📈'
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
