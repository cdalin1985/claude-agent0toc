import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, AlertTriangle, Users, DollarSign, Settings, FileText, Trophy, UserPlus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { GlassCard } from '../components/GlassCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { formatDistanceToNow, formatDate } from '../utils/time';
import type { Match, Player, TreasuryEntry, AuditEvent, LeagueSettings } from '../types/database';

export default function AdminPage() {
  const { profile } = useAuthStore();
  const navigate    = useNavigate();
  const qc          = useQueryClient();
  const [tab, setTab] = useState<'disputes' | 'players' | 'treasury' | 'rank1' | 'settings' | 'audit'>('disputes');

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

      {/* Tabs — 3×2 grid */}
      <div className="grid grid-cols-3 gap-1 mb-5 bg-[#1A1A1A] rounded-xl p-1">
        {[
          { key: 'disputes', icon: AlertTriangle, label: 'Disputes' },
          { key: 'players',  icon: Users,         label: 'Players' },
          { key: 'treasury', icon: DollarSign,    label: 'Treasury' },
          { key: 'rank1',    icon: Trophy,        label: 'Rank #1' },
          { key: 'settings', icon: Settings,      label: 'Settings' },
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
      {tab === 'rank1'    && <Rank1Tab isSuperAdmin={profile?.role === 'super_admin'} />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'audit'    && <AuditTab />}
    </div>
  );
}

// ─── Disputes ────────────────────────────────────────────────────────────────

function DisputesTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const { data: disputes = [] } = useQuery<Match[]>({
    queryKey: ['admin-disputes'],
    queryFn: async () => {
      const { data } = await supabase.from('matches').select('*').eq('status', 'disputed');
      return data ?? [];
    },
  });

  const { data: players = [] } = useQuery<Pick<Player, 'id' | 'full_name'>[]>({
    queryKey: ['players-lookup'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('id, full_name');
      return data ?? [];
    },
  });

  const getPlayerName = (id: string) => players.find((p) => p.id === id)?.full_name ?? id.slice(0, 8) + '…';

  const [resolving, setResolving] = useState<string | null>(null);
  const [winnerId, setWinnerId]   = useState('');
  const [p1Score, setP1Score]     = useState('');
  const [p2Score, setP2Score]     = useState('');
  const [notes, setNotes]         = useState('');
  const [loading, setLoading]     = useState(false);

  const handleResolve = async (matchId: string) => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-dispute`, {
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
          <div className="text-[#E8E2D6] font-[Outfit] text-sm font-semibold mb-0.5">
            {getPlayerName(m.player1_id)} vs {getPlayerName(m.player2_id)}
          </div>
          <div className="text-[#E8E2D6] font-[Outfit] text-sm mb-1">
            Score: {m.player1_score}–{m.player2_score}
          </div>
          <div className="text-[#9CA3AF] text-xs font-[Outfit] mb-3">
            {m.discipline} · Race to {m.race_length} · {m.venue}
          </div>
          {resolving === m.id ? (
            <div className="space-y-3">
              {/* Winner selection — name buttons instead of UUID input */}
              <div>
                <p className="text-[#9CA3AF] text-xs font-[Outfit] mb-2">Select winner:</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: m.player1_id, name: getPlayerName(m.player1_id) },
                    { id: m.player2_id, name: getPlayerName(m.player2_id) },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setWinnerId(p.id)}
                      className={[
                        'py-3 px-2 rounded-xl border text-sm font-[Outfit] font-medium transition-all',
                        winnerId === p.id
                          ? 'border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]'
                          : 'border-[#333] bg-[#252525]/50 text-[#E8E2D6]',
                      ].join(' ')}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
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
                <Button variant="primary" size="sm" loading={loading} disabled={!winnerId} onClick={() => handleResolve(m.id)}>
                  Resolve
                </Button>
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

// ─── Players ─────────────────────────────────────────────────────────────────

function PlayersTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ['admin-players'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('*').order('full_name');
      return data ?? [];
    },
  });

  const [adding, setAdding]     = useState(false);
  const [newName, setNewName]   = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  const toggleActive = async (p: Player) => {
    await supabase.from('players').update({ is_active: !p.is_active }).eq('id', p.id);
    qc.invalidateQueries({ queryKey: ['admin-players'] });
  };

  const handleAddPlayer = async () => {
    if (!newName.trim()) return;
    setAddLoading(true);
    setAddError('');
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/add-player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ full_name: newName.trim() }),
    });
    const json = await res.json();
    setAddLoading(false);
    if (json.error) { setAddError(json.error); return; }
    setNewName('');
    setAdding(false);
    qc.invalidateQueries({ queryKey: ['admin-players'] });
    qc.invalidateQueries({ queryKey: ['rankings'] });
  };

  return (
    <div className="space-y-3">
      {/* Add player */}
      {adding ? (
        <GlassCard className="p-4">
          <h3 className="font-[Bebas_Neue] text-lg text-[#E8E2D6] mb-3">Add New Player</h3>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Full name"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
            className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Outfit] text-sm focus:outline-none focus:border-[#C62828] mb-3"
          />
          {addError && <p className="text-[#EF4444] text-xs font-[Outfit] mb-2">{addError}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setNewName(''); setAddError(''); }}>Cancel</Button>
            <Button variant="primary" size="sm" loading={addLoading} disabled={!newName.trim()} onClick={handleAddPlayer}>
              Add Player
            </Button>
          </div>
        </GlassCard>
      ) : (
        <Button variant="secondary" fullWidth onClick={() => setAdding(true)}>
          <UserPlus size={16} /> Add New Player
        </Button>
      )}

      <p className="text-[#9CA3AF] text-xs font-[Outfit]">{players.length} total players</p>
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

// ─── Treasury ────────────────────────────────────────────────────────────────

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

// ─── Rank #1 Compliance ──────────────────────────────────────────────────────

type Rank1Status = {
  penalized?: boolean;
  player?: string;
  top5_matches?: number;
  days_elapsed?: number;
  days_remaining?: number;
  compliant?: boolean;
  message?: string;
  error?: string;
};

function Rank1Tab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [status, setStatus] = useState<Rank1Status | null>(null);
  const [loading, setLoading] = useState(false);

  const callFn = async (enforce: boolean) => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rank1-compliance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ enforce }),
    });
    setStatus(await res.json());
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <h3 className="font-[Bebas_Neue] text-xl text-[#E8E2D6] mb-1">Rank #1 Obligation</h3>
        <p className="text-[#9CA3AF] text-xs font-[Outfit] mb-4">
          The #1 player must play 2 top-5 opponents within 30 days of reaching #1 or be moved to #10.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth loading={loading} onClick={() => callFn(false)}>
            Check Status
          </Button>
          {isSuperAdmin && (
            <Button variant="danger" fullWidth loading={loading} onClick={() => callFn(true)}>
              Enforce Now
            </Button>
          )}
        </div>
      </GlassCard>

      {status && (
        <GlassCard className="p-5">
          {status.error ? (
            <p className="text-[#EF4444] text-sm font-[Outfit]">{status.error}</p>
          ) : status.message ? (
            <p className="text-[#9CA3AF] text-sm font-[Outfit]">{status.message}</p>
          ) : status.penalized ? (
            <>
              <div className="text-3xl mb-2">📉</div>
              <div className="font-[Bebas_Neue] text-xl text-[#EF4444] mb-1">Penalty Applied</div>
              <p className="text-[#9CA3AF] text-sm font-[Outfit]">
                {status.player} was moved to #10 — only {status.top5_matches}/2 top-5 matches in {status.days_elapsed} days.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="font-[Outfit] font-semibold text-[#E8E2D6]">{status.player}</span>
                <Badge variant={status.compliant ? 'win' : 'pending'}>
                  {status.compliant ? 'Compliant' : 'At Risk'}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="font-[JetBrains_Mono] font-bold text-2xl text-[#E8E2D6]">{status.top5_matches}/2</div>
                  <div className="text-[#6B7280] text-xs font-[Outfit]">Top-5 matches</div>
                </div>
                <div className="text-center">
                  <div className="font-[JetBrains_Mono] font-bold text-2xl text-[#E8E2D6]">{status.days_elapsed}</div>
                  <div className="text-[#6B7280] text-xs font-[Outfit]">Days elapsed</div>
                </div>
                <div className="text-center">
                  <div
                    className="font-[JetBrains_Mono] font-bold text-2xl"
                    style={{ color: (status.days_remaining ?? 30) <= 7 ? '#EF4444' : '#E8E2D6' }}
                  >
                    {status.days_remaining}
                  </div>
                  <div className="text-[#6B7280] text-xs font-[Outfit]">Days left</div>
                </div>
              </div>
            </>
          )}
        </GlassCard>
      )}
    </div>
  );
}

// ─── League Settings ─────────────────────────────────────────────────────────

function SettingsTab() {
  const { data: settings } = useQuery<LeagueSettings>({
    queryKey: ['league-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('league_settings').select('*').single();
      return data!;
    },
  });

  const [edits, setEdits]   = useState<Partial<Record<keyof LeagueSettings, number>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const get = (key: keyof LeagueSettings) =>
    key in edits ? (edits[key as keyof typeof edits] as number) : (settings?.[key] as number ?? 0);

  const set = (key: keyof LeagueSettings, val: number) =>
    setEdits((e) => ({ ...e, [key]: val }));

  const handleSave = async () => {
    if (!settings || Object.keys(edits).length === 0) return;
    setSaving(true);
    await supabase.from('league_settings').update(edits).eq('id', settings.id);
    setSaving(false);
    setEdits({});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) {
    return <div className="text-center py-12 text-[#6B7280] font-[Outfit]">Loading settings…</div>;
  }

  const Field = ({ label, fieldKey, unit }: { label: string; fieldKey: keyof LeagueSettings; unit: string }) => (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div>
        <div className="font-[Outfit] text-sm text-[#E8E2D6]">{label}</div>
        <div className="text-[#6B7280] text-xs font-[Outfit]">{unit}</div>
      </div>
      <input
        type="number"
        value={get(fieldKey)}
        onChange={(e) => set(fieldKey, parseInt(e.target.value) || 0)}
        className="w-20 px-3 py-1.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[JetBrains_Mono] text-sm text-center focus:outline-none focus:border-[#C62828]"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <h3 className="font-[Bebas_Neue] text-xl text-[#E8E2D6] mb-1">League Rules</h3>
        <Field label="Min race length"          fieldKey="min_race"                  unit="games" />
        <Field label="Challenge range"          fieldKey="challenge_range"           unit="spots (normal)" />
        <Field label="First challenge range"    fieldKey="first_challenge_range"     unit="spots (first ever)" />
        <Field label="Weekly challenge limit"   fieldKey="challenge_weekly_limit"    unit="challenges per 7 days" />
        <Field label="Challenge response window" fieldKey="challenge_response_hours" unit="hours to accept/decline" />
        <Field label="Match play window"        fieldKey="match_play_days"           unit="days after acceptance" />
        <Field label="Post-match cooldown"      fieldKey="cooldown_hours"            unit="hours after a win" />
        <Field label="Challenge expiry"         fieldKey="challenge_expiry_days"     unit="days until auto-expire" />
      </GlassCard>
      <Button
        variant="primary"
        fullWidth
        loading={saving}
        disabled={Object.keys(edits).length === 0}
        onClick={handleSave}
      >
        {saved ? '✓ Saved' : 'Save Settings'}
      </Button>
    </div>
  );
}

// ─── Audit ───────────────────────────────────────────────────────────────────

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
