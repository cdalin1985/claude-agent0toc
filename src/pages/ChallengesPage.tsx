import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, MapPin, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useRankings } from '../hooks/useRankings';
import { GlassCard } from '../components/GlassCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { RankingRowSkeleton } from '../components/Skeleton';
import { formatDistanceToNow, formatDateTime } from '../utils/time';
import type { Challenge } from '../types/database';

const VENUES = ['Eagles 4040', 'Valley Hub'] as const;
type Venue = typeof VENUES[number];

function usePlayerChallenges(playerId: string | undefined) {
  return useQuery<Challenge[]>({
    queryKey: ['challenges', playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const { data } = await supabase
        .from('challenges')
        .select('*')
        .or(`challenger_id.eq.${playerId},challenged_id.eq.${playerId}`)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!playerId,
  });
}

// Accept/Decline modal
function RespondModal({
  challenge,
  onClose,
  onSuccess,
}: {
  challenge: Challenge;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [venue, setVenue]       = useState<Venue | ''>('');
  const [date, setDate]         = useState('');
  const [time, setTime]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleAccept = async () => {
    if (!venue || !date || !time) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    setError('');
    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/respond-to-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ challenge_id: challenge.id, action: 'accept', venue, scheduled_at: scheduledAt }),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    setLoading(false);
    if (json.error) { setError(json.error); return; }
    onSuccess();
  };

  const handleDecline = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/respond-to-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ challenge_id: challenge.id, action: 'decline' }),
    });
    setLoading(false);
    onSuccess();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        className="glass-card p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-[Bebas_Neue] text-2xl text-[#E8E2D6] mb-1">Respond to Challenge</h2>
        <p className="text-[#9CA3AF] text-sm font-[Outfit] mb-4">
          {challenge.discipline} · Race to {challenge.race_length}
        </p>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-[#9CA3AF] text-xs font-[Outfit] mb-1.5 flex items-center gap-1">
              <MapPin size={12} /> Venue
            </label>
            <select
              value={venue}
              onChange={(e) => setVenue(e.target.value as Venue)}
              className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Outfit] text-sm focus:outline-none focus:border-[#C62828]"
            >
              <option value="">Select venue…</option>
              {VENUES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[#9CA3AF] text-xs font-[Outfit] mb-1.5 flex items-center gap-1">
                <Calendar size={12} /> Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Outfit] text-sm focus:outline-none focus:border-[#C62828]"
              />
            </div>
            <div>
              <label className="block text-[#9CA3AF] text-xs font-[Outfit] mb-1.5 flex items-center gap-1">
                <Clock size={12} /> Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Outfit] text-sm focus:outline-none focus:border-[#C62828]"
              />
            </div>
          </div>
        </div>

        {error && <p className="text-[#EF4444] text-xs font-[Outfit] mb-3">{error}</p>}

        <div className="flex gap-2">
          <Button variant="danger" fullWidth onClick={handleDecline} loading={loading}>
            Decline
          </Button>
          <Button variant="success" fullWidth onClick={handleAccept} loading={loading}>
            Accept ✓
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function ChallengesPage() {
  const { player } = useAuthStore();
  const { data: rankings = [] } = useRankings();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'incoming' | 'outgoing' | 'history'>('incoming');
  const [responding, setResponding] = useState<Challenge | null>(null);

  const { data: challenges = [], isLoading } = usePlayerChallenges(player?.id);

  const getPlayerName = (id: string) =>
    rankings.find((r) => r.player.id === id)?.player.full_name ?? 'Unknown';

  const incoming = challenges.filter((c) => c.challenged_id === player?.id && c.status === 'pending');
  const outgoing = challenges.filter((c) => c.challenger_id === player?.id && ['pending', 'accepted', 'scheduled'].includes(c.status));
  const history  = challenges.filter((c) => ['confirmed', 'declined', 'expired', 'forfeited', 'cancelled', 'in_progress', 'submitted'].includes(c.status));

  const statusBadge = (status: string) => {
    const map: Record<string, 'pending' | 'win' | 'loss' | 'default'> = {
      pending: 'pending', accepted: 'win', scheduled: 'info' as never,
      declined: 'loss', expired: 'default', forfeited: 'loss', cancelled: 'default',
      confirmed: 'win', in_progress: 'pending', submitted: 'pending',
    };
    return map[status] ?? 'default';
  };

  const handleSuccess = () => {
    setResponding(null);
    qc.invalidateQueries({ queryKey: ['challenges'] });
    qc.invalidateQueries({ queryKey: ['matches'] });
  };

  const handleCancel = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/respond-to-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ challenge_id: id, action: 'cancel' }),
    });
    qc.invalidateQueries({ queryKey: ['challenges'] });
  };

  const currentList = tab === 'incoming' ? incoming : tab === 'outgoing' ? outgoing : history;

  return (
    <div className="min-h-screen px-4 pt-8 pb-4">
      <h1 className="font-[Bebas_Neue] text-5xl tracking-wide text-[#E8E2D6] mb-5">Challenges</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-[#1A1A1A] rounded-xl p-1">
        {([
          { key: 'incoming', label: 'Incoming', count: incoming.length },
          { key: 'outgoing', label: 'Outgoing', count: outgoing.length },
          { key: 'history',  label: 'History',  count: 0 },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'flex-1 py-2 rounded-lg text-sm font-[Outfit] font-medium transition-all duration-200 relative',
              tab === t.key ? 'bg-[#C62828] text-white' : 'text-[#9CA3AF]',
            ].join(' ')}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1 bg-white/20 text-white text-xs rounded-full px-1.5">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <RankingRowSkeleton key={i} />)}
        </div>
      ) : currentList.length === 0 ? (
        <EmptyState
          icon={tab === 'incoming' ? '📥' : tab === 'outgoing' ? '📤' : '📋'}
          title={tab === 'incoming' ? 'No Incoming Challenges' : tab === 'outgoing' ? 'No Active Challenges' : 'No History Yet'}
          message={
            tab === 'incoming' ? 'No one has challenged you yet. The table is waiting!'
            : tab === 'outgoing' ? "You haven't sent any challenges. Step up!"
            : 'Your completed challenges will appear here.'
          }
          action={tab !== 'history' ? (
            <Button variant="primary" onClick={() => navigate('/rankings?challenge=1')}>
              Find an Opponent
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {currentList.map((c, i) => {
            const isChallenger = c.challenger_id === player?.id;
            const opponentId   = isChallenger ? c.challenged_id : c.challenger_id;
            const opponentName = getPlayerName(opponentId);
            const expires      = new Date(c.expires_at);
            const daysLeft     = Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86400000));

            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <GlassCard
                  className="p-4"
                  hover={c.status === 'scheduled' || c.status === 'in_progress'}
                  onClick={c.status === 'scheduled' || c.status === 'in_progress'
                    ? () => navigate(`/match/${c.id}`)  // simplification: navigate to match
                    : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-[Outfit] font-semibold text-[#E8E2D6] truncate">
                          {isChallenger ? `→ ${opponentName}` : `← ${opponentName}`}
                        </span>
                        <Badge variant={statusBadge(c.status) as never}>
                          {c.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="text-[#9CA3AF] text-xs font-[JetBrains_Mono]">
                        {c.discipline} · Race to {c.race_length}
                      </div>
                      {c.scheduled_at && (
                        <div className="text-[#9CA3AF] text-xs font-[Outfit] mt-1">
                          📅 {formatDateTime(c.scheduled_at)} @ {c.venue}
                        </div>
                      )}
                      {c.status === 'pending' && (
                        <div className="text-[#F59E0B] text-xs font-[Outfit] mt-1">
                          ⏰ Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 shrink-0">
                      {tab === 'incoming' && c.status === 'pending' && (
                        <Button variant="primary" size="sm" onClick={() => setResponding(c)}>
                          Respond
                        </Button>
                      )}
                      {tab === 'outgoing' && c.status === 'pending' && (
                        <Button variant="ghost" size="sm" onClick={() => handleCancel(c.id)}>
                          Cancel
                        </Button>
                      )}
                      {(c.status === 'scheduled' || c.status === 'in_progress') && (
                        <Button variant="secondary" size="sm" onClick={() => navigate(`/match/${c.id}`)}>
                          View Match
                        </Button>
                      )}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {responding && (
          <RespondModal
            challenge={responding}
            onClose={() => setResponding(null)}
            onSuccess={handleSuccess}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
