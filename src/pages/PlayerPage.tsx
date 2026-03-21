import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Swords } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useRankings } from '../hooks/useRankings';
import { PoolBall } from '../components/PoolBall';
import { GlassCard } from '../components/GlassCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { CardSkeleton } from '../components/Skeleton';
import { formatDate } from '../utils/time';
import type { Match } from '../types/database';

function canChallenge(myPos: number, theirPos: number) {
  return Math.abs(myPos - theirPos) <= 5 && myPos !== theirPos;
}

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { player: myPlayer } = useAuthStore();
  const { data: rankings = [] } = useRankings();

  const targetRanking = rankings.find((r) => r.player.id === id);
  const myRanking     = rankings.find((r) => r.player.id === myPlayer?.id);

  const eligible = myRanking && targetRanking
    ? canChallenge(myRanking.ranking.position, targetRanking.ranking.position)
    : false;

  // Match history
  const { data: matches = [], isLoading } = useQuery<Match[]>({
    queryKey: ['player-matches', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('matches')
        .select('*')
        .or(`player1_id.eq.${id},player2_id.eq.${id}`)
        .in('status', ['confirmed', 'resolved'])
        .order('completed_at', { ascending: false })
        .limit(10);
      return data ?? [];
    },
    enabled: !!id,
  });

  if (!targetRanking) {
    return (
      <div className="min-h-screen px-4 pt-8 space-y-4">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={3} />
      </div>
    );
  }

  const { player, ranking, metrics, stats } = targetRanking;
  const winPct = stats && stats.matches_played > 0
    ? Math.round((stats.wins / stats.matches_played) * 100)
    : 0;

  // Head-to-head
  const h2h = matches.filter((m) =>
    (m.player1_id === myPlayer?.id || m.player2_id === myPlayer?.id) &&
    (m.player1_id === id || m.player2_id === id)
  );
  const h2hWins   = h2h.filter((m) => m.winner_id === myPlayer?.id).length;
  const h2hLosses = h2h.filter((m) => m.loser_id === myPlayer?.id).length;

  return (
    <div className="min-h-screen px-4 pt-4 pb-4">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-[#9CA3AF] font-[Outfit] text-sm mb-4 p-2 -ml-2"
      >
        <ChevronLeft size={18} /> Back
      </button>

      {/* Hero card */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <GlassCard className="p-6 text-center relative overflow-hidden mb-4">
          <div className="absolute inset-0 bg-gradient-to-br from-[#C62828]/5 to-transparent pointer-events-none" />
          <PoolBall position={ranking.position} size={80} className="mx-auto mb-4" />
          <h1 className="font-[Bebas_Neue] text-4xl text-[#E8E2D6]">{player.full_name}</h1>
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="font-[JetBrains_Mono] text-2xl font-bold text-[#C62828]">
              #{ranking.position}
            </span>
            {metrics?.fargo_rating && (
              <Badge variant="default">FR {metrics.fargo_rating}</Badge>
            )}
            {!player.profile_id && <Badge variant="default">Unclaimed</Badge>}
          </div>
          {metrics?.fargo_robustness && (
            <div className="text-[#6B7280] text-xs font-[JetBrains_Mono] mt-1">
              Robustness: {metrics.fargo_robustness}
            </div>
          )}
          {eligible && myPlayer && (
            <div className="mt-4">
              <Button variant="primary" onClick={() => navigate(`/challenge/${id}`)}>
                <Swords size={16} /> Challenge
              </Button>
            </div>
          )}
        </GlassCard>
      </motion.div>

      {/* Stats grid */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.35 }}>
        <GlassCard className="p-4 mb-4">
          <h2 className="font-[Bebas_Neue] text-xl text-[#E8E2D6] mb-3">Season Stats</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Wins',        value: stats?.wins ?? 0,           color: '#22C55E' },
              { label: 'Losses',      value: stats?.losses ?? 0,         color: '#EF4444' },
              { label: 'Win %',       value: `${winPct}%`,              color: '#E8E2D6' },
              { label: 'Points',      value: stats?.points ?? 0,         color: '#D4AF37' },
              { label: 'Streak',      value: stats?.current_streak ?? 0, color: stats?.current_streak && stats.current_streak > 0 ? '#22C55E' : '#9CA3AF' },
              { label: 'Best Streak', value: stats?.best_streak ?? 0,    color: '#9CA3AF' },
            ].map((s) => (
              <div key={s.label} className="text-center bg-[#252525]/60 rounded-xl p-3">
                <div className="font-[JetBrains_Mono] font-bold text-2xl" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[#6B7280] text-xs font-[Outfit] mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      </motion.div>

      {/* Head-to-head (only show if we've played them) */}
      {h2h.length > 0 && myPlayer && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.35 }}>
          <GlassCard className="p-4 mb-4">
            <h2 className="font-[Bebas_Neue] text-xl text-[#E8E2D6] mb-3">Head to Head</h2>
            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <div className="font-[JetBrains_Mono] text-3xl font-bold text-[#22C55E]">{h2hWins}</div>
                <div className="text-[#6B7280] text-xs font-[Outfit]">Your Wins</div>
              </div>
              <div className="text-[#6B7280] text-lg font-[Bebas_Neue]">VS</div>
              <div className="text-center">
                <div className="font-[JetBrains_Mono] text-3xl font-bold text-[#EF4444]">{h2hLosses}</div>
                <div className="text-[#6B7280] text-xs font-[Outfit]">Their Wins</div>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Match history */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.35 }}>
        <GlassCard className="p-4">
          <h2 className="font-[Bebas_Neue] text-xl text-[#E8E2D6] mb-3">Match History</h2>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
            </div>
          ) : matches.length === 0 ? (
            <p className="text-[#6B7280] text-sm font-[Outfit] py-4 text-center">No matches yet.</p>
          ) : (
            <div className="space-y-2">
              {matches.map((m) => {
                const won = m.winner_id === id;
                const s1  = m.player1_id === id ? m.player1_score : m.player2_score;
                const s2  = m.player1_id === id ? m.player2_score : m.player1_score;
                return (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#252525]/50">
                    <div className={`w-1 h-8 rounded-full ${won ? 'bg-[#22C55E]' : 'bg-[#EF4444]'}`} />
                    <div className="flex-1">
                      <div className="text-sm font-[Outfit] font-medium text-[#E8E2D6]">{m.discipline}</div>
                      <div className="text-xs text-[#6B7280] font-[Outfit]">{formatDate(m.completed_at ?? m.scheduled_at)}</div>
                    </div>
                    <div className="font-[JetBrains_Mono] font-bold text-lg text-[#E8E2D6]">
                      <span style={{ color: won ? '#22C55E' : '#EF4444' }}>{s1}</span>–{s2}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </motion.div>
    </div>
  );
}
