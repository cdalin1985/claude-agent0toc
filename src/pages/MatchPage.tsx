import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Plus, Minus, Flag, CheckCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useRankings } from '../hooks/useRankings';
import { PoolBall } from '../components/PoolBall';
import { GlassCard } from '../components/GlassCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { formatDateTime } from '../utils/time';
import type { Match } from '../types/database';

// Animated score counter
function ScoreDisplay({ value, color }: { value: number; color: string }) {
  return (
    <motion.div
      key={value}
      initial={{ scale: 1.3, opacity: 0.5 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 600, damping: 25 }}
      className="font-[JetBrains_Mono] font-bold leading-none"
      style={{ fontSize: '72px', color }}
    >
      {value}
    </motion.div>
  );
}

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { player } = useAuthStore();
  const { data: rankings = [] } = useRankings();
  const [submitting, setSubmitting]     = useState(false);
  const [submitModal, setSubmitModal]   = useState(false);
  const [submitError, setSubmitError]   = useState('');
  const [submittedWinner, setSubmittedWinner] = useState<string | null>(null);

  const { data: match, isLoading } = useQuery<Match>({
    queryKey: ['match', id],
    queryFn: async () => {
      const { data } = await supabase.from('matches').select('*').eq('id', id).single();
      return data!;
    },
    enabled: !!id,
    refetchInterval: 5000,
  });

  if (isLoading || !match) {
    return (
      <div className="min-h-screen px-4 pt-4 space-y-4">
        <div className="skeleton h-8 w-24" />
        <div className="skeleton h-64 rounded-xl" />
        <div className="skeleton h-40 rounded-xl" />
      </div>
    );
  }

  const isPlayer1 = match.player1_id === player?.id;
  const isPlayer2 = match.player2_id === player?.id;
  const amInMatch  = isPlayer1 || isPlayer2;

  const p1Name = rankings.find((r) => r.player.id === match.player1_id)?.player.full_name ?? 'Player 1';
  const p2Name = rankings.find((r) => r.player.id === match.player2_id)?.player.full_name ?? 'Player 2';
  const p1Pos  = rankings.find((r) => r.player.id === match.player1_id)?.ranking.position ?? 1;
  const p2Pos  = rankings.find((r) => r.player.id === match.player2_id)?.ranking.position ?? 2;

  const myScore       = isPlayer1 ? match.player1_score : match.player2_score;
  const theirScore    = isPlayer1 ? match.player2_score : match.player1_score;
  const myId          = isPlayer1 ? match.player1_id : match.player2_id;
  const theirId       = isPlayer1 ? match.player2_id : match.player1_id;

  const callFn = async (path: string, body: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const handleScoreUpdate = async (winnerId: string) => {
    if (!amInMatch || submitting) return;
    const newMyScore    = winnerId === myId    ? myScore + 1 : myScore;
    const newTheirScore = winnerId === theirId ? theirScore + 1 : theirScore;
    setSubmitting(true);
    const p1Score = isPlayer1 ? newMyScore : newTheirScore;
    const p2Score = isPlayer1 ? newTheirScore : newMyScore;
    await callFn('update-match-score', {
      match_id: match.id,
      my_score: isPlayer1 ? p1Score : p2Score,
      opponent_score: isPlayer1 ? p2Score : p1Score,
    });
    setSubmitting(false);
    qc.invalidateQueries({ queryKey: ['match', id] });
  };

  const handleSubmitResult = async () => {
    if (!submittedWinner) return;
    setSubmitting(true);
    setSubmitError('');
    const p1Score = match.player1_score;
    const p2Score = match.player2_score;
    const json = await callFn('submit-result', {
      match_id: match.id,
      winner_id: submittedWinner,
      final_score_player1: p1Score,
      final_score_player2: p2Score,
    });
    setSubmitting(false);
    if (json.error) { setSubmitError(json.error); return; }
    setSubmitModal(false);
    qc.invalidateQueries({ queryKey: ['match', id] });
    qc.invalidateQueries({ queryKey: ['rankings'] });
  };

  const hasSubmitted = (isPlayer1 && match.player1_submitted) || (isPlayer2 && match.player2_submitted);
  const isWinner    = match.winner_id === player?.id;
  const statusColor = match.status === 'confirmed' ? '#22C55E'
                    : match.status === 'disputed'  ? '#EF4444'
                    : match.status === 'in_progress' ? '#F59E0B'
                    : '#9CA3AF';

  return (
    <div className="min-h-screen px-4 pt-4 pb-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[#9CA3AF] p-2 -ml-2 mb-4">
        <ChevronLeft size={18} /> Back
      </button>

      {/* Match header */}
      <div className="text-center mb-5">
        <Badge variant={match.status === 'confirmed' ? 'win' : match.status === 'disputed' ? 'loss' : 'pending'}>
          {match.status.replace('_', ' ').toUpperCase()}
        </Badge>
        <div className="text-[#9CA3AF] text-xs font-[Outfit] mt-2">
          {match.discipline} · Race to {match.race_length}
        </div>
        <div className="text-[#6B7280] text-xs font-[Outfit] mt-1">
          {formatDateTime(match.scheduled_at)} @ {match.venue}
        </div>
      </div>

      {/* Scoreboard */}
      <GlassCard className="p-6 mb-5">
        <div className="flex items-center justify-around">
          {/* Player 1 */}
          <div className="flex flex-col items-center gap-2">
            <PoolBall position={p1Pos} size={52} />
            <div className="font-[Outfit] font-semibold text-sm text-[#E8E2D6] text-center max-w-[80px] leading-tight">
              {p1Name.split(' ')[0]}
            </div>
            <ScoreDisplay
              value={match.player1_score}
              color={match.winner_id === match.player1_id ? '#22C55E'
                   : match.winner_id && match.winner_id !== match.player1_id ? '#EF4444'
                   : '#E8E2D6'}
            />
            {/* Score button */}
            {match.status === 'in_progress' && amInMatch && !hasSubmitted && (
              <button
                onClick={() => handleScoreUpdate(match.player1_id)}
                disabled={submitting}
                className="w-10 h-10 rounded-full bg-[#22C55E]/20 border border-[#22C55E]/40 flex items-center justify-center active:scale-95 transition-transform"
              >
                <Plus size={20} className="text-[#22C55E]" />
              </button>
            )}
          </div>

          {/* VS */}
          <div className="font-[Bebas_Neue] text-3xl text-[#6B7280]">VS</div>

          {/* Player 2 */}
          <div className="flex flex-col items-center gap-2">
            <PoolBall position={p2Pos} size={52} />
            <div className="font-[Outfit] font-semibold text-sm text-[#E8E2D6] text-center max-w-[80px] leading-tight">
              {p2Name.split(' ')[0]}
            </div>
            <ScoreDisplay
              value={match.player2_score}
              color={match.winner_id === match.player2_id ? '#22C55E'
                   : match.winner_id && match.winner_id !== match.player2_id ? '#EF4444'
                   : '#E8E2D6'}
            />
            {match.status === 'in_progress' && amInMatch && !hasSubmitted && (
              <button
                onClick={() => handleScoreUpdate(match.player2_id)}
                disabled={submitting}
                className="w-10 h-10 rounded-full bg-[#22C55E]/20 border border-[#22C55E]/40 flex items-center justify-center active:scale-95 transition-transform"
              >
                <Plus size={20} className="text-[#22C55E]" />
              </button>
            )}
          </div>
        </div>

        {/* Race progress bar */}
        <div className="mt-6">
          <div className="flex justify-between text-xs text-[#6B7280] font-[Outfit] mb-1">
            <span>Race to {match.race_length}</span>
            <span>{Math.max(match.player1_score, match.player2_score)}/{match.race_length} games played</span>
          </div>
          <div className="h-1.5 bg-[#333] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#C62828] rounded-full transition-all duration-500"
              style={{ width: `${(Math.max(match.player1_score, match.player2_score) / match.race_length) * 100}%` }}
            />
          </div>
        </div>
      </GlassCard>

      {/* Actions */}
      {amInMatch && (
        <div className="space-y-3">
          {match.status === 'scheduled' && (
            <Button
              variant="primary"
              fullWidth
              size="lg"
              loading={submitting}
              onClick={async () => {
                setSubmitting(true);
                await callFn('update-match-score', {
                  match_id: match.id,
                  my_score: 0,
                  opponent_score: 0,
                });
                setSubmitting(false);
                qc.invalidateQueries({ queryKey: ['match', id] });
              }}
            >
              🎱 Start Match
            </Button>
          )}

          {match.status === 'in_progress' && !hasSubmitted && (
            <Button
              variant="primary"
              fullWidth
              size="lg"
              onClick={() => setSubmitModal(true)}
            >
              <Flag size={18} /> Submit Final Result
            </Button>
          )}

          {hasSubmitted && match.status === 'submitted' && (
            <GlassCard className="p-4 text-center">
              <CheckCircle size={32} className="text-[#22C55E] mx-auto mb-2" />
              <div className="font-[Outfit] font-semibold text-[#E8E2D6]">Result submitted!</div>
              <div className="text-[#9CA3AF] text-sm font-[Outfit] mt-1">
                Waiting for your opponent to confirm…
              </div>
            </GlassCard>
          )}

          {match.status === 'confirmed' && (
            <GlassCard className="p-6 text-center">
              <div className="text-5xl mb-3">{isWinner ? '🏆' : '😤'}</div>
              <div className="font-[Bebas_Neue] text-4xl" style={{ color: isWinner ? '#22C55E' : '#EF4444' }}>
                {isWinner ? 'Victory!' : 'Defeat'}
              </div>
              <div className="text-[#9CA3AF] font-[Outfit] text-sm mt-2">
                Final: {match.player1_score}–{match.player2_score}
              </div>
            </GlassCard>
          )}

          {match.status === 'disputed' && (
            <GlassCard className="p-4">
              <div className="text-[#EF4444] font-[Outfit] font-semibold mb-1">⚠️ Result Disputed</div>
              <div className="text-[#9CA3AF] text-sm font-[Outfit]">
                The submitted scores don't match. An admin will review and resolve this match.
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* Submit result modal */}
      <AnimatePresence>
        {submitModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
            onClick={() => setSubmitModal(false)}
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="glass-card p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-[Bebas_Neue] text-2xl text-[#E8E2D6] mb-2">Who Won?</h2>
              <p className="text-[#9CA3AF] text-sm font-[Outfit] mb-5">
                Final score: {match.player1_score}–{match.player2_score}
              </p>
              <div className="space-y-3 mb-5">
                {[
                  { id: match.player1_id, name: p1Name, score: match.player1_score, pos: p1Pos },
                  { id: match.player2_id, name: p2Name, score: match.player2_score, pos: p2Pos },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSubmittedWinner(p.id)}
                    className={[
                      'w-full flex items-center gap-3 p-4 rounded-xl border transition-all',
                      submittedWinner === p.id
                        ? 'border-[#22C55E] bg-[#22C55E]/10'
                        : 'border-[#333] bg-[#252525]/50',
                    ].join(' ')}
                  >
                    <PoolBall position={p.pos} size={36} />
                    <div className="flex-1 text-left">
                      <div className="font-[Outfit] font-semibold text-[#E8E2D6] text-sm">{p.name}</div>
                      <div className="text-[#9CA3AF] text-xs font-[JetBrains_Mono]">{p.score} games</div>
                    </div>
                    {submittedWinner === p.id && <CheckCircle size={20} className="text-[#22C55E]" />}
                  </button>
                ))}
              </div>
              {submitError && <p className="text-[#EF4444] text-xs font-[Outfit] mb-3">{submitError}</p>}
              <div className="flex gap-2">
                <Button variant="ghost" fullWidth onClick={() => setSubmitModal(false)}>Cancel</Button>
                <Button
                  variant="primary"
                  fullWidth
                  loading={submitting}
                  disabled={!submittedWinner}
                  onClick={handleSubmitResult}
                >
                  Submit
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
