import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, MapPin, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useRankings } from '../hooks/useRankings';
import { useLeagueSettings, venuesFrom } from '../hooks/useLeagueSettings';
import { GlassCard } from '../components/GlassCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { RankingRowSkeleton } from '../components/Skeleton';
import { QueryError } from '../components/QueryError';
import { formatDateTime } from '../utils/time';
import type { Challenge, ChallengeProposal } from '../types/database';

// Venues come from league_settings; a venue added in Admin appears here with
// no code change.
type Venue = string;
type ChallengeWithHoursLeft = Challenge & { hours_left: number };

function usePlayerChallenges(playerId: string | undefined) {
  return useQuery<ChallengeWithHoursLeft[]>({
    queryKey: ['challenges', playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const { data, error } = await supabase
        .from('challenges')
        .select('*')
        .or(`challenger_id.eq.${playerId},challenged_id.eq.${playerId}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const now = Date.now();
      return (data ?? []).map((challenge) => ({
        ...challenge,
        hours_left: Math.max(0, Math.ceil((new Date(challenge.expires_at).getTime() - now) / 3600000)),
      }));
    },
    enabled: !!playerId,
  });
}

/**
 * The live proposal on each challenge, keyed by challenge id. At most one row
 * per challenge is 'pending' (enforced by a partial unique index), and its
 * author is the player waiting — so this is also what decides whose turn it is.
 */
function usePendingProposals(challengeIds: string[]) {
  const key = challengeIds.join(',');
  return useQuery<Map<string, ChallengeProposal>>({
    queryKey: ['challenge-proposals', key],
    queryFn: async () => {
      if (challengeIds.length === 0) return new Map();
      const { data, error } = await supabase
        .from('challenge_proposals')
        .select('*')
        .in('challenge_id', challengeIds)
        .eq('status', 'pending');
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.challenge_id, p as ChallengeProposal]));
    },
    enabled: challengeIds.length > 0,
  });
}

function RespondModal({
  challenge,
  proposal,
  myPlayerId,
  playerName,
  onClose,
  onSuccess,
}: {
  challenge: Challenge;
  proposal: ChallengeProposal | null;
  myPlayerId: string;
  playerName: (id: string) => string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [venue, setVenue]     = useState<Venue | ''>('');
  const [date, setDate]       = useState('');
  const [time, setTime]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  // Whose turn it is. A proposal you made yourself is one you are waiting on,
  // not one you can answer.
  const theirProposal = proposal && proposal.proposed_by_player_id !== myPlayerId ? proposal : null;
  const myProposal    = proposal && proposal.proposed_by_player_id === myPlayerId ? proposal : null;
  const [showCounter, setShowCounter] = useState(false);
  const { data: leagueSettings } = useLeagueSettings();
  const venues = venuesFrom(leagueSettings);
  const negotiating = challenge.status === 'accepted';

  const callFn = async (body: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Your sign-in expired. Please sign in again.' };
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/respond-to-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    // A failing function can return a non-JSON body; don't let that throw.
    const json = await res.json().catch(() => ({})) as { success?: boolean; error?: string };
    if (!res.ok && !json.error) return { error: 'Something went wrong. Please try again.' };
    return json;
  };

  const handlePropose = async () => {
    if (!venue || !date || !time) { setError('Pick a venue, a date and a time.'); return; }
    setLoading(true);
    setError('');
    try {
      const scheduledAt = new Date(`${date}T${time}`).toISOString();
      const json = await callFn({ challenge_id: challenge.id, action: 'propose', venue, scheduled_at: scheduledAt });
      if (json.error) { setError(json.error); return; }
      onSuccess();
    } catch {
      setError('Connection problem — nothing was sent. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptProposal = async () => {
    setLoading(true);
    setError('');
    try {
      const json = await callFn({ challenge_id: challenge.id, action: 'accept_proposal' });
      if (json.error) { setError(json.error); return; }
      onSuccess();
    } catch {
      setError('Connection problem — nothing was sent. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);

  const handleDecline = async () => {
    setLoading(true);
    setError('');
    try {
      const json = await callFn({ challenge_id: challenge.id, action: 'decline' });
      if (json.error) { setError(json.error); return; }
      setShowDeclineConfirm(false);
      onSuccess();
    } catch {
      setError('Connection problem — nothing was sent. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleWash = async () => {
    setLoading(true);
    setError('');
    try {
      // The result was discarded here, so a refused wash — the match has already
      // started, someone else moved the challenge on — closed the modal as if it
      // had worked.
      const json = await callFn({ challenge_id: challenge.id, action: 'wash' });
      if (json.error) { setError(json.error); return; }
      onSuccess();
    } catch {
      setError('Connection problem — nothing was sent. Please try again.');
    } finally {
      setLoading(false);
    }
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
        <h2 className="font-[Bebas_Neue] text-2xl text-[#E8E2D6] mb-1">
          {negotiating ? 'Sort out a time' : 'Respond to Challenge'}
        </h2>
        <p className="text-[#9CA3AF] text-sm font-[Barlow] mb-4">
          {challenge.discipline} · Race to {challenge.race_length}
        </p>

        {theirProposal && (
          <div className="mb-4 p-3 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/5">
            <div className="text-[#9CA3AF] text-xs font-[Barlow] mb-1">
              {playerName(theirProposal.proposed_by_player_id)} suggested
            </div>
            <div className="text-[#E8E2D6] font-[Barlow] font-semibold text-sm">
              📅 {formatDateTime(theirProposal.scheduled_at)}
            </div>
            <div className="text-[#E8E2D6] font-[Barlow] text-sm">📍 {theirProposal.venue}</div>
            {theirProposal.message && (
              <div className="text-[#9CA3AF] text-xs font-[Barlow] mt-1.5 italic">“{theirProposal.message}”</div>
            )}
          </div>
        )}

        {myProposal && (
          <div className="mb-4 p-3 rounded-xl border border-[#333] bg-[#252525]/50">
            <div className="text-[#9CA3AF] text-xs font-[Barlow] mb-1">
              Waiting on {playerName(challenge.challenger_id === myPlayerId ? challenge.challenged_id : challenge.challenger_id)}
            </div>
            <div className="text-[#E8E2D6] font-[Barlow] font-semibold text-sm">
              📅 {formatDateTime(myProposal.scheduled_at)}
            </div>
            <div className="text-[#E8E2D6] font-[Barlow] text-sm">📍 {myProposal.venue}</div>
            <div className="text-[#6B7280] text-xs font-[Barlow] mt-1.5">
              You suggested this. They can accept it or suggest another.
            </div>
          </div>
        )}

        <div className={`space-y-3 mb-4 ${theirProposal && !showCounter ? 'hidden' : ''}`}>
          <div>
            <label className="block text-[#9CA3AF] text-xs font-[Barlow] mb-1.5 flex items-center gap-1">
              <MapPin size={12} /> Venue
            </label>
            <select
              value={venue}
              onChange={(e) => setVenue(e.target.value as Venue)}
              className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Barlow] text-sm focus:outline-none focus:border-[#C62828]"
            >
              <option value="">Select venue…</option>
              {venues.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[#9CA3AF] text-xs font-[Barlow] mb-1.5 flex items-center gap-1">
                <Calendar size={12} /> Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Barlow] text-sm focus:outline-none focus:border-[#C62828]"
              />
            </div>
            <div>
              <label className="block text-[#9CA3AF] text-xs font-[Barlow] mb-1.5 flex items-center gap-1">
                <Clock size={12} /> Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Barlow] text-sm focus:outline-none focus:border-[#C62828]"
              />
            </div>
          </div>
        </div>

        {error && <p className="text-[#EF4444] text-xs font-[Barlow] mb-3">{error}</p>}

        {showDeclineConfirm ? (
          <div className="space-y-3 mb-2 p-3 rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/5">
            <div className="text-sm font-[Barlow] font-semibold text-[#E8E2D6]">
              Decline counts as a forfeit
            </div>
            <ul className="text-xs font-[Barlow] text-[#9CA3AF] space-y-1 list-disc list-inside">
              <li>The challenger gets a win by forfeit and may take your spot if they are lower ranked.</li>
              <li>You get a forfeit on your record and a post-match cooldown.</li>
              <li>No match fee is owed.</li>
              <li>An admin can reverse this only if your rankings and stats have not changed yet.</li>
            </ul>
            <a href="/rules" className="block text-xs font-[Barlow] text-[#C62828] underline underline-offset-2">
              Read the league rules
            </a>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" fullWidth size="sm" onClick={() => setShowDeclineConfirm(false)} disabled={loading}>
                Keep pending
              </Button>
              <Button variant="danger" fullWidth size="sm" onClick={handleDecline} loading={loading}>
                Decline anyway
              </Button>
            </div>
          </div>
        ) : negotiating ? (
          <div className="space-y-2 mb-2">
            {theirProposal && !showCounter && (
              <>
                <Button variant="success" fullWidth onClick={handleAcceptProposal} loading={loading}>
                  That works ✓
                </Button>
                <Button variant="secondary" fullWidth onClick={() => setShowCounter(true)} disabled={loading}>
                  Suggest a different time
                </Button>
              </>
            )}
            {theirProposal && showCounter && (
              <>
                <Button variant="success" fullWidth onClick={handlePropose} loading={loading}>
                  Send this suggestion
                </Button>
                <Button variant="ghost" fullWidth size="sm" onClick={() => setShowCounter(false)} disabled={loading}>
                  Back
                </Button>
              </>
            )}
            {myProposal && (
              <Button variant="secondary" fullWidth disabled>
                Waiting for their reply…
              </Button>
            )}
          </div>
        ) : (
          <div className="flex gap-2 mb-2">
            <Button variant="danger" fullWidth onClick={() => setShowDeclineConfirm(true)} disabled={loading}>
              Decline (forfeit)
            </Button>
            <Button variant="success" fullWidth onClick={handlePropose} loading={loading}>
              Suggest this time ✓
            </Button>
          </div>
        )}
        <Button variant="ghost" fullWidth size="sm" onClick={handleWash} loading={loading}>
          We couldn't agree on a time
        </Button>
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
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [listError, setListError] = useState('');

  const { data: challengesData, isLoading, isError, refetch, isRefetching } = usePlayerChallenges(player?.id);
  // Memoized because negotiatingIds derives from it; a fresh [] each render
  // would refetch the proposals on every render.
  const challenges = useMemo(() => challengesData ?? [], [challengesData]);

  const playerNameById = useMemo(
    () => new Map(rankings.map((r) => [r.player.id, r.player.full_name])),
    [rankings],
  );
  const getPlayerName = (id: string) => playerNameById.get(id) ?? 'Unknown';

  const negotiatingIds = useMemo(
    () => challenges.filter((c) => c.status === 'accepted').map((c) => c.id),
    [challenges],
  );
  const { data: pendingProposals = new Map<string, ChallengeProposal>() } = usePendingProposals(negotiatingIds);

  // 'accepted' means the two are still agreeing on when and where, so a
  // challenge sits in Incoming while the reply is owed by this player.
  const incoming = challenges.filter((c) => c.challenged_id === player?.id && ['pending', 'accepted'].includes(c.status));
  const outgoing = challenges.filter((c) => c.challenger_id === player?.id && ['pending', 'accepted', 'scheduled'].includes(c.status));
  const history  = challenges.filter((c) => ['confirmed', 'declined', 'expired', 'forfeited', 'cancelled', 'in_progress', 'submitted'].includes(c.status));

  const statusBadge = (status: string): 'pending' | 'win' | 'loss' | 'default' => {
    const map: Record<string, 'pending' | 'win' | 'loss' | 'default'> = {
      pending: 'pending', accepted: 'win', scheduled: 'pending',
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

  const callFn = async (body: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Your sign-in expired. Please sign in again.');
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/respond-to-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok || json.error) throw new Error(json.error ?? 'Something went wrong. Please try again.');
    qc.invalidateQueries({ queryKey: ['challenges'] });
  };

  const runChallengeAction = async (challengeId: string, action: 'cancel' | 'wash') => {
    setActioningId(challengeId);
    setListError('');
    try {
      await callFn({ challenge_id: challengeId, action });
    } catch (e) {
      // This is the path that reports "you can't wash a match that's already
      // under way". Swallowing it made the button look like it did nothing.
      setListError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setActioningId(null);
    }
  };

  const currentList = tab === 'incoming' ? incoming : tab === 'outgoing' ? outgoing : history;

  return (
    <div className="min-h-screen px-4 pt-8 pb-4">
      <h1 className="font-[Bebas_Neue] text-5xl tracking-wide text-[#E8E2D6] mb-5">Challenges</h1>

      {listError && (
        <div className="mb-4 p-3 rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/5">
          <p className="text-[#EF4444] text-sm font-[Barlow]">{listError}</p>
        </div>
      )}

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
              'flex-1 py-2 rounded-lg text-sm font-[Barlow] font-medium transition-all duration-200',
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

      {isError && challengesData === undefined ? (
        <QueryError onRetry={() => refetch()} retrying={isRefetching} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <RankingRowSkeleton key={i} />)}
        </div>
      ) : currentList.length === 0 ? (
        <EmptyState
          icon={tab === 'incoming' ? '📥' : tab === 'outgoing' ? '📤' : '📋'}
          title={tab === 'incoming' ? 'No Incoming Challenges' : tab === 'outgoing' ? 'No Active Challenges' : 'No History Yet'}
          message={
            tab === 'incoming' ? 'No one has challenged you yet.'
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
            const hoursLeft    = c.hours_left;

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
                    ? () => navigate(`/match/${c.id}`)
                    : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-[Barlow] font-semibold text-[#E8E2D6] truncate">
                          {isChallenger ? `→ ${opponentName}` : `← ${opponentName}`}
                        </span>
                        <Badge variant={statusBadge(c.status)}>
                          {c.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="text-[#9CA3AF] text-xs font-[Azeret_Mono]">
                        {c.discipline} · Race to {c.race_length}
                      </div>
                      {c.scheduled_at && (
                        <div className="text-[#9CA3AF] text-xs font-[Barlow] mt-1">
                          📅 {formatDateTime(c.scheduled_at)} @ {c.venue}
                        </div>
                      )}
                      {c.match_deadline && c.status === 'scheduled' && (
                        <div className="text-[#F59E0B] text-xs font-[Barlow] mt-1">
                          ⏰ Must be played by {new Date(c.match_deadline).toLocaleDateString()}
                        </div>
                      )}
                      {c.status === 'pending' && hoursLeft > 0 && (
                        <div className={`text-xs font-[Barlow] mt-1 ${hoursLeft <= 24 ? 'text-[#EF4444]' : hoursLeft <= 72 ? 'text-[#F59E0B]' : 'text-[#6B7280]'}`}>
                          {hoursLeft <= 24 ? '⚠️' : '⏰'}{' '}
                          Expires in{' '}
                          {hoursLeft >= 48
                            ? `${Math.floor(hoursLeft / 24)}d ${hoursLeft % 24}h`
                            : `${hoursLeft}h`}
                        </div>
                      )}
                      {c.status === 'pending' && hoursLeft === 0 && (
                        <div className="text-[#EF4444] text-xs font-[Barlow] mt-1">⚠️ Expiring soon</div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      {tab === 'incoming' && c.status === 'pending' && (
                        <Button variant="primary" size="sm" onClick={() => setResponding(c)}>
                          Respond
                        </Button>
                      )}
                      {c.status === 'accepted' && (
                        <Button
                          variant={pendingProposals.get(c.id)?.proposed_by_player_id === player?.id ? 'secondary' : 'primary'}
                          size="sm"
                          onClick={() => setResponding(c)}
                        >
                          {pendingProposals.get(c.id)?.proposed_by_player_id === player?.id ? 'Waiting…' : 'Pick a time'}
                        </Button>
                      )}
                      {tab === 'outgoing' && c.status === 'pending' && (
                        <Button variant="ghost" size="sm" loading={actioningId === c.id} onClick={() => runChallengeAction(c.id, 'cancel')}>
                          Cancel
                        </Button>
                      )}
                      {(c.status === 'scheduled' || c.status === 'in_progress') && (
                        <>
                          <Button variant="secondary" size="sm" onClick={() => navigate(`/match/${c.id}`)}>
                            View Match
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={actioningId === c.id}
                            onClick={() => runChallengeAction(c.id, 'wash')}
                          >
                            Couldn't agree
                          </Button>
                        </>
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
        {responding && player && (
          <RespondModal
            challenge={responding}
            proposal={pendingProposals.get(responding.id) ?? null}
            myPlayerId={player.id}
            playerName={getPlayerName}
            onClose={() => setResponding(null)}
            onSuccess={handleSuccess}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
