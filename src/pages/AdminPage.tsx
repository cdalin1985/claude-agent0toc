import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, AlertTriangle, Users, DollarSign, Settings, FileText } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { GlassCard } from '../components/GlassCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { formatDistanceToNow, formatDate } from '../utils/time';
import type { Match, Player, TreasuryEntry, AuditEvent } from '../types/database';

export default function AdminPage() {
  const { profile } = useAuthStore();
  const navigate    = useNavigate();
  const qc          = useQueryClient();
  const [tab, setTab] = useState<'disputes' | 'players' | 'treasury' | 'audit'>('disputes');

  // Redirect non-admins
  if (profile && !['admin', 'super_admin'].includes(profile.role)) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen px-4 pt-4 pb-8">
      <button onClick={() => navigate('/')} className="flex items-center gap-1 text-[#9CA3AF] p-2 -ml-2 mb-4">
        <ChevronLeft size={18} /> Back
      </button>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">🛡️</span>
        <h1 className="font-[Bebas_Neue] text-5xl text-[#E8E2D6]">Admin</h1>
        <Badge variant="info">{profile?.role}</Badge>
      </div>
      <p className="text-[#9CA3AF] text-sm font-[Outfit] mb-6">League management — handle with care.</p>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 mb-5 bg-[#1A1A1A] rounded-xl p-1">
        {[
          { key: 'disputes', icon: AlertTriangle, label: 'Disputes' },
          { key: 'players',  icon: Users,         label: 'Players' },
          { key: 'treasury', icon: DollarSign,    label: 'Treasury' },
          { key: 'audit',    icon: FileText,      label: 'Audit' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`flex flex-col items-center py-2 rounded-lg text-xs font-[Outfit] transition-all ${tab === t.key ? 'bg-[#C62828] text-white' : 'text-[#9CA3AF]'}`}
          >
            <t.icon size={16} className="mb-0.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'disputes' && <DisputesTab qc={qc} />}
      {tab === 'players'  && <PlayersTab qc={qc} />}
      {tab === 'treasury' && <TreasuryTab />}
      {tab === 'audit'    && <AuditTab />}
    </div>
  );
}

function DisputesTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const { data: disputes = [] } = useQuery<Match[]>({
    queryKey: ['admin-disputes'],
    queryFn: async () => {
      const { data } = await supabase.from('matches').select('*').eq('status', 'disputed');
      return data ?? [];
    },
  });

  const [resolving, setResolving]   = useState<string | null>(null);
  const [winnerId, setWinnerId]     = useState('');
  const [p1Score, setP1Score]       = useState('');
  const [p2Score, setP2Score]       = useState('');
  const [notes, setNotes]           = useState('');
  const [loading, setLoading]       = useState(false);

  const handleResolve = async (matchId: string) => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        match_id: matchId,
        winner_id: winnerId,
        final_score_player1: parseInt(p1Score),
        final_score_player2: parseInt(p2Score),
        notes,
      }),
    });
    setLoading(false);
    setResolving(null);
    qc.invalidateQueries({ queryKey: ['admin-disputes'] });
    qc.invalidateQueries({ queryKey: ['rankings'] });
  };

  if (disputes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">✅</div>
        <div className="font-[Bebas_Neue] text-2xl text-[#E8E2D6]">No Disputed Matches</div>
        <div className="text-[#9CA3AF] text-sm font-[Outfit] mt-1">All matches are resolved.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {disputes.map((m) => (
        <GlassCard key={m.id} className="p-4">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="loss">DISPUTED</Badge>
            <span className="text-[#6B7280] text-xs font-[Outfit]">{formatDate(m.created_at)}</span>
          </div>
          <div className="text-[#E8E2D6] font-[Outfit] text-sm mb-1">
            Score: {m.player1_score}–{m.player2_score}
          </div>
          <div className="text-[#9CA3AF] text-xs font-[Outfit] mb-3">
            {m.discipline} · Race to {m.race_length} · {m.venue}
          </div>
          {resolving === m.id ? (
            <div className="space-y-2">
              <input placeholder="Winner player ID" value={winnerId} onChange={(e) => setWinnerId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] text-xs font-[Outfit] focus:outline-none focus:border-[#C62828]" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="P1 score" value={p1Score} onChange={(e) => setP1Score(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] text-xs font-[Outfit] focus:outline-none focus:border-[#C62828]" />
                <input type="number" placeholder="P2 score" value={p2Score} onChange={(e) => setP2Score(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] text-xs font-[Outfit] focus:outline-none focus:border-[#C62828]" />
              </div>
              <textarea placeholder="Admin notes…" value={notes} onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] text-xs font-[Outfit] focus:outline-none focus:border-[#C62828] resize-none" />
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setResolving(null)}>Cancel</Button>
                <Button variant="primary" size="sm" loading={loading} onClick={() => handleResolve(m.id)}>Resolve</Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" size="sm" onClick={() => { setResolving(m.id); setWinnerId(''); setP1Score(''); setP2Score(''); setNotes(''); }}>
              Resolve Dispute
            </Button>
          )}
        </GlassCard>
      ))}
    </div>
  );
}

function PlayersTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ['admin-players'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('*').order('full_name');
      return data ?? [];
    },
  });

  const toggleActive = async (p: Player) => {
    await supabase.from('players').update({ is_active: !p.is_active }).eq('id', p.id);
    qc.invalidateQueries({ queryKey: ['admin-players'] });
  };

  return (
    <div className="space-y-2">
      <p className="text-[#9CA3AF] text-xs font-[Outfit] mb-3">{players.length} total players</p>
      {players.map((p) => (
        <GlassCard key={p.id} className="p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className={`font-[Outfit] font-semibold text-sm truncate ${p.is_active ? 'text-[#E8E2D6]' : 'text-[#6B7280] line-through'}`}>
              {p.full_name}
            </div>
            <div className="text-[#6B7280] text-xs font-[Outfit]">
              {p.profile_id ? 'Claimed' : 'Unclaimed'}
            </div>
          </div>
          <button
            onClick={() => toggleActive(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-[Outfit] font-medium transition-colors ${p.is_active ? 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/30' : 'bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30'}`}
          >
            {p.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </GlassCard>
      ))}
    </div>
  );
}

function TreasuryTab() {
  const [entryType, setEntryType] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount]       = useState('');
  const [desc, setDesc]           = useState('');
  const [loading, setLoading]     = useState(false);

  const { data: entries = [] } = useQuery<TreasuryEntry[]>({
    queryKey: ['treasury'],
    queryFn: async () => {
      const { data } = await supabase.from('treasury_ledger').select('*').order('created_at', { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  const balance = entries.reduce((sum, e) => {
    if (e.entry_type === 'credit') return sum + e.amount_cents;
    if (e.entry_type === 'debit')  return sum - e.amount_cents;
    return sum;
  }, 0);

  const handleAdd = async () => {
    if (!amount || !desc) return;
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-treasury`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        entry_type: entryType,
        amount_cents: Math.round(parseFloat(amount) * 100),
        description: desc,
      }),
    });
    setLoading(false);
    setAmount('');
    setDesc('');
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-5 text-center">
        <div className="text-[#9CA3AF] text-sm font-[Outfit] mb-1">Current Balance</div>
        <div className="font-[JetBrains_Mono] font-bold text-5xl" style={{ color: balance >= 0 ? '#22C55E' : '#EF4444' }}>
          ${(Math.abs(balance) / 100).toFixed(2)}
        </div>
        {balance < 0 && <div className="text-[#EF4444] text-xs font-[Outfit] mt-1">In deficit</div>}
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="font-[Bebas_Neue] text-xl text-[#E8E2D6] mb-3">Add Entry</h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            {(['credit', 'debit'] as const).map((t) => (
              <button key={t} onClick={() => setEntryType(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-[Outfit] font-medium transition-all ${entryType === t ? (t === 'credit' ? 'bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/40' : 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40') : 'bg-[#252525] text-[#9CA3AF] border border-[#333]'}`}>
                {t === 'credit' ? '+ Credit' : '- Debit'}
              </button>
            ))}
          </div>
          <input type="number" step="0.01" placeholder="Amount ($)" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Outfit] text-sm focus:outline-none focus:border-[#C62828]" />
          <input placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Outfit] text-sm focus:outline-none focus:border-[#C62828]" />
          <Button variant="primary" fullWidth loading={loading} onClick={handleAdd} disabled={!amount || !desc}>
            Add Entry
          </Button>
        </div>
      </GlassCard>

      <div className="space-y-2">
        {entries.map((e) => (
          <GlassCard key={e.id} className="p-3 flex items-center justify-between">
            <div>
              <div className="font-[Outfit] text-sm text-[#E8E2D6]">{e.description}</div>
              <div className="text-[#6B7280] text-xs font-[Outfit]">{formatDate(e.created_at)}</div>
            </div>
            <div className={`font-[JetBrains_Mono] font-bold ${e.entry_type === 'credit' ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
              {e.entry_type === 'credit' ? '+' : '-'}${(e.amount_cents / 100).toFixed(2)}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function AuditTab() {
  const { data: events = [] } = useQuery<AuditEvent[]>({
    queryKey: ['audit-events'],
    queryFn: async () => {
      const { data } = await supabase.from('audit_events').select('*').order('created_at', { ascending: false }).limit(30);
      return data ?? [];
    },
  });

  if (events.length === 0) {
    return <div className="text-center py-12 text-[#6B7280] font-[Outfit]">No audit events yet.</div>;
  }

  return (
    <div className="space-y-2">
      {events.map((e) => (
        <GlassCard key={e.id} className="p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-[Outfit] font-semibold text-sm text-[#E8E2D6]">{e.action}</span>
            <span className="text-[#6B7280] text-xs font-[Outfit]">{formatDistanceToNow(e.created_at)}</span>
          </div>
          {e.target_type && (
            <div className="text-[#9CA3AF] text-xs font-[Outfit]">{e.target_type}: {e.target_id?.slice(0, 8)}…</div>
          )}
        </GlassCard>
      ))}
    </div>
  );
}
