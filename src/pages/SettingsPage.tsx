import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LogOut, User, Volume2, VolumeX, Shield, Bell, BellOff, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { useRankings } from '../hooks/useRankings';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { PoolBall } from '../components/PoolBall';
import { GlassCard } from '../components/GlassCard';
import { Button } from '../components/Button';

const DISCIPLINES = ['8 Ball', '9 Ball', '10 Ball'] as const;

export default function SettingsPage() {
  const navigate  = useNavigate();
  const { profile, player, reset } = useAuthStore();
  const { soundEnabled, setSoundEnabled } = useUIStore();
  const { supported: pushSupported, subscribed: pushSubscribed, permission: pushPermission, loading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications();
  const { data: rankings = [] } = useRankings();
  const [displayName,   setDisplayName]   = useState(profile?.display_name ?? '');
  const [bio,           setBio]           = useState('');
  const [preferredDisc, setPreferredDisc] = useState<typeof DISCIPLINES[number] | ''>('');
  const [saving,        setSaving]        = useState(false);
  const [signingOut,    setSigningOut]    = useState(false);

  const myRanking = rankings.find((r) => r.player.id === player?.id);

  // Load bio and preferred_discipline from fresh player data
  useEffect(() => {
    if (!player) return;
    supabase.from('players').select('bio, preferred_discipline').eq('id', player.id).single()
      .then(({ data }) => {
        if (data) {
          setBio(data.bio ?? '');
          setPreferredDisc((data.preferred_discipline as typeof DISCIPLINES[number] | null) ?? '');
        }
      });
  }, [player?.id]);

  const handleSaveName = async () => {
    if (!profile || !displayName.trim()) return;
    setSaving(true);
    await supabase.from('profiles').update({ display_name: displayName.trim() }).eq('id', profile.id);
    setSaving(false);
  };

  const handleSaveProfile = async () => {
    if (!player) return;
    setSaving(true);
    await supabase.from('players').update({
      bio: bio.trim() || null,
      preferred_discipline: preferredDisc || null,
    }).eq('id', player.id);
    setSaving(false);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    reset();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen px-4 pt-8 pb-4 space-y-4">
      <h1 className="font-[Bebas_Neue] text-5xl tracking-wide text-[#E8E2D6] mb-2">Settings</h1>

      {/* Profile card */}
      {player && myRanking && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard className="p-5">
            <div className="flex items-center gap-4 mb-5">
              <PoolBall position={myRanking.ranking.position} size={56} />
              <div>
                <div className="font-[Bebas_Neue] text-2xl text-[#E8E2D6]">{player.full_name}</div>
                <div className="text-[#9CA3AF] text-sm font-[Outfit]">{profile?.email}</div>
                <div className="text-[#C62828] font-[JetBrains_Mono] text-sm">
                  Rank #{myRanking.ranking.position}
                </div>
              </div>
            </div>

            {/* Display name */}
            <div className="mb-4">
              <label className="block text-[#9CA3AF] text-sm font-[Outfit] mb-2 flex items-center gap-1">
                <User size={14} /> Display Name
              </label>
              <div className="flex gap-2">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={player.full_name}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Outfit] text-sm focus:outline-none focus:border-[#C62828] transition-colors"
                />
                <Button variant="secondary" size="sm" loading={saving} onClick={handleSaveName}>
                  Save
                </Button>
              </div>
            </div>

            {/* Bio */}
            <div className="mb-4">
              <label className="block text-[#9CA3AF] text-sm font-[Outfit] mb-2 flex items-center gap-1">
                <FileText size={14} /> Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder="A few words about your game…"
                className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Outfit] text-sm focus:outline-none focus:border-[#C62828] transition-colors resize-none"
              />
              <div className="text-right text-xs text-[#6B7280] font-[Outfit] mt-1">
                {bio.length}/200
              </div>
            </div>

            {/* Preferred discipline */}
            <div className="mb-5">
              <label className="block text-[#9CA3AF] text-sm font-[Outfit] mb-2">
                Preferred Discipline
              </label>
              <div className="flex gap-2">
                {DISCIPLINES.map((d) => (
                  <button
                    key={d}
                    onClick={() => setPreferredDisc(preferredDisc === d ? '' : d)}
                    className={[
                      'flex-1 py-2 rounded-lg text-xs font-[Outfit] font-medium border transition-all',
                      preferredDisc === d
                        ? 'bg-[#C62828] border-[#C62828] text-white'
                        : 'border-[#333] text-[#9CA3AF]',
                    ].join(' ')}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <Button variant="primary" fullWidth loading={saving} onClick={handleSaveProfile}>
              Save Profile
            </Button>

            <div className="text-xs text-[#6B7280] font-[Outfit] mt-3">
              Email (read-only): {profile?.email}
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Preferences */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <GlassCard className="p-5">
          <h2 className="font-[Bebas_Neue] text-xl text-[#E8E2D6] mb-4">Preferences</h2>

          <div className="flex items-center justify-between py-3 border-b border-white/5">
            <div className="flex items-center gap-3">
              {soundEnabled ? <Volume2 size={18} className="text-[#9CA3AF]" /> : <VolumeX size={18} className="text-[#9CA3AF]" />}
              <div>
                <div className="font-[Outfit] font-medium text-[#E8E2D6] text-sm">Sound Effects</div>
                <div className="text-[#6B7280] text-xs font-[Outfit]">UI sounds and celebrations</div>
              </div>
            </div>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`w-12 h-6 rounded-full transition-colors relative ${soundEnabled ? 'bg-[#C62828]' : 'bg-[#333]'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${soundEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {pushSupported && (
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                {pushSubscribed ? <Bell size={18} className="text-[#9CA3AF]" /> : <BellOff size={18} className="text-[#9CA3AF]" />}
                <div>
                  <div className="font-[Outfit] font-medium text-[#E8E2D6] text-sm">Push Notifications</div>
                  <div className="text-[#6B7280] text-xs font-[Outfit]">
                    {pushPermission === 'denied'
                      ? 'Blocked in browser settings'
                      : pushSubscribed
                      ? 'Challenges, results & more'
                      : 'Get notified when action is needed'}
                  </div>
                </div>
              </div>
              <button
                onClick={pushSubscribed ? pushUnsubscribe : pushSubscribe}
                disabled={pushLoading || pushPermission === 'denied'}
                className={`w-12 h-6 rounded-full transition-colors relative disabled:opacity-40 ${pushSubscribed ? 'bg-[#C62828]' : 'bg-[#333]'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${pushSubscribed ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )}
        </GlassCard>
      </motion.div>

      {/* Admin link */}
      {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <GlassCard className="p-5" hover onClick={() => navigate('/admin')}>
            <div className="flex items-center gap-3">
              <Shield size={20} className="text-[#C62828]" />
              <div>
                <div className="font-[Outfit] font-semibold text-[#E8E2D6]">Admin Dashboard</div>
                <div className="text-[#9CA3AF] text-xs font-[Outfit]">Disputes, treasury, player management</div>
              </div>
              <div className="ml-auto text-[#6B7280]">→</div>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* App info */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
        <GlassCard className="p-5">
          <h2 className="font-[Bebas_Neue] text-xl text-[#E8E2D6] mb-3">About</h2>
          <div className="space-y-1 text-[#9CA3AF] text-sm font-[Outfit]">
            <div>Top of the Capital — Helena Pool League</div>
            <div className="text-[#6B7280] text-xs">Version 1.0.0 · Built with ❤️ in Helena, MT</div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Sign out */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Button
          variant="danger"
          fullWidth
          size="lg"
          loading={signingOut}
          onClick={handleSignOut}
        >
          <LogOut size={18} /> Sign Out
        </Button>
      </motion.div>
    </div>
  );
}
