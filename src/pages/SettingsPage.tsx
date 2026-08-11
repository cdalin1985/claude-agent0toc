import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { LogOut, User, Volume2, VolumeX, Shield, Bell, BellOff, FileText, Camera, X, Swords, Clock, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { useRankings } from '../hooks/useRankings';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useLeagueSettings, venuesFrom } from '../hooks/useLeagueSettings';
import { Avatar } from '../components/Avatar';
import { GlassCard } from '../components/GlassCard';
import { Button } from '../components/Button';
import type { PlayerPreferences } from '../types/database';
import { isMissingSchemaObject, onlyExistingColumns } from '../lib/schemaGaps';

const DISCIPLINES = ['8 Ball', '9 Ball', '10 Ball'] as const;

const PRESET_ICONS = ['🎱','🔵','🟡','🦁','🐺','🦅','🐉','⚡','🔥','🎯','💀','🌙'];

// Exactly the palette the players.accent_color CHECK constraint permits
// (20260807010000_profile_banner_accent.sql). Naming them makes the picker
// legible, and keeping this list identical to the constraint means no swatch
// can ever fail to save.
const ACCENT_COLORS = [
  { hex: '#C62828', name: 'TOC Red' },
  { hex: '#E53935', name: 'Bright Red' },
  { hex: '#D4AF37', name: 'Gold' },
  { hex: '#22C55E', name: 'Green' },
  { hex: '#3B82F6', name: 'Blue' },
  { hex: '#A855F7', name: 'Purple' },
  { hex: '#F59E0B', name: 'Amber' },
  { hex: '#06B6D4', name: 'Cyan' },
];

/**
 * One switch row. Extracted because there are now eight of them, and eight
 * copies of the same markup is eight places to fix a padding bug.
 */
function ToggleRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[#9CA3AF] shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="font-[Barlow] font-medium text-[#E8E2D6] text-sm">{title}</div>
          <div className="text-[#6B7280] text-xs font-[Barlow]">{description}</div>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'w-12 h-6 rounded-full transition-colors relative shrink-0 ml-3',
          checked ? 'bg-[#C62828]' : 'bg-[#333]',
          disabled ? 'opacity-40' : '',
        ].join(' ')}
      >
        <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${checked ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const navigate  = useNavigate();
  const { profile, player, setPlayer, reset } = useAuthStore();
  const { soundEnabled, setSoundEnabled } = useUIStore();
  const { supported: pushSupported, subscribed: pushSubscribed, permission: pushPermission, loading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications();
  const { data: rankings = [] } = useRankings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const { data: leagueSettings } = useLeagueSettings();
  const venues = venuesFrom(leagueSettings);

  const [displayName,   setDisplayName]   = useState(profile?.display_name ?? '');
  const [bio,           setBio]           = useState('');
  const [preferredDisc, setPreferredDisc] = useState<typeof DISCIPLINES[number] | ''>('');
  const [nickname,      setNickname]      = useState('');
  const [tagline,       setTagline]       = useState('');
  const [accentColor,   setAccentColor]   = useState<string | null>(null);
  const [bannerSaving,  setBannerSaving]  = useState(false);
  const [bannerError,   setBannerError]   = useState('');
  const [homeVenue,     setHomeVenue]     = useState('');
  const [yearsPlaying,  setYearsPlaying]  = useState('');
  const [cueBrand,      setCueBrand]      = useState('');
  const [profileError,  setProfileError]  = useState('');
  const [profileSaved,  setProfileSaved]  = useState(false);
  const [prefs,         setPrefs]         = useState<PlayerPreferences | null>(null);
  // null = still loading, false = the table is not there yet, true = usable.
  const [prefsSupported, setPrefsSupported] = useState<boolean | null>(null);
  const [prefsError,    setPrefsError]    = useState('');
  // The row exactly as the database returned it — the only trustworthy record of
  // which profile columns actually exist.
  const [playerRow,     setPlayerRow]     = useState<Record<string, unknown> | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [signingOut,    setSigningOut]    = useState(false);
  const [avatarSaving,  setAvatarSaving]  = useState(false);
  const [avatarError,   setAvatarError]   = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);

  const myRanking = rankings.find((r) => r.player.id === player?.id);
  const playerId = player?.id;

  useEffect(() => {
    if (!playerId) return;
    // select('*') rather than naming the new columns: naming one the database
    // does not have yet 400s the whole request and takes bio and preferred
    // discipline down with it, which is exactly what broke live on 2026-08-10.
    supabase.from('players')
      .select('*')
      .eq('id', playerId).single()
      .then(({ data }) => {
        if (data) {
          setPlayerRow(data as Record<string, unknown>);
          setBio(data.bio ?? '');
          setPreferredDisc((data.preferred_discipline as typeof DISCIPLINES[number] | null) ?? '');
          setNickname(data.nickname ?? '');
          setTagline(data.tagline ?? '');
          setAccentColor(data.accent_color ?? null);
          setHomeVenue(data.home_venue ?? '');
          setYearsPlaying(data.years_playing === null ? '' : String(data.years_playing));
          setCueBrand(data.cue_brand ?? '');
        }
      });
  }, [playerId]);

  // Preferences are created by a trigger, one row per player, so this only ever
  // reads and updates — never inserts.
  useEffect(() => {
    if (!playerId) return;
    supabase.from('player_preferences').select('*').eq('player_id', playerId).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          // Hide the section rather than spinning forever on a table that is
          // not there yet.
          setPrefsSupported(!isMissingSchemaObject(error) ? true : false);
          return;
        }
        setPrefsSupported(true);
        if (data) setPrefs(data);
      });
  }, [playerId]);

  /**
   * Writes one toggle immediately. Optimistic so the switch never lags under a
   * thumb, and reverted with an explanation if the write fails — a toggle that
   * silently springs back is the worst version of this.
   */
  const setPreference = async (key: keyof PlayerPreferences, value: boolean) => {
    if (!player || !prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    setPrefsError('');
    const { error } = await supabase
      .from('player_preferences')
      .update({ [key]: value, updated_at: new Date().toISOString() })
      .eq('player_id', player.id);
    if (error) {
      setPrefs(previous);
      setPrefsError(`Couldn't save that setting: ${error.message}`);
    }
  };

  const handleSaveName = async () => {
    if (!profile || !displayName.trim()) return;
    setSaving(true);
    await supabase.from('profiles').update({ display_name: displayName.trim() }).eq('id', profile.id);
    setSaving(false);
  };

  const handleSaveProfile = async () => {
    if (!player) return;
    setProfileError('');
    setProfileSaved(false);

    // Mirrors the CHECK constraints so a player gets a plain sentence instead of
    // a Postgres constraint name.
    const years = yearsPlaying.trim() === '' ? null : Number(yearsPlaying);
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 90)) {
      setProfileError('Years playing must be a whole number between 0 and 90.');
      return;
    }
    setSaving(true);
    // Narrowed to columns the loaded row actually has, so a database that is
    // behind the app saves what it can instead of rejecting everything.
    const { error } = await supabase.from('players').update(onlyExistingColumns({
      bio: bio.trim() || null,
      preferred_discipline: preferredDisc || null,
      nickname: nickname.trim() || null,
      tagline: tagline.trim() || null,
      home_venue: homeVenue || null,
      years_playing: years,
      cue_brand: cueBrand.trim() || null,
    }, playerRow)).eq('id', player.id);
    setSaving(false);

    if (error) {
      setProfileError(`Couldn't save your profile: ${error.message}`);
      return;
    }
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  };

  const handleBannerUpload = async (file: File) => {
    if (!player || !profile) return;
    if (file.size > 5 * 1024 * 1024) { setBannerError('Banner must be under 5 MB.'); return; }
    setBannerSaving(true);
    setBannerError('');
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${profile.id}/banner.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('banners').upload(path, file, { upsert: true });
    if (uploadErr) { setBannerError(uploadErr.message); setBannerSaving(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('banners').getPublicUrl(path);
    const { error: saveErr } = await supabase.from('players').update({ banner_url: publicUrl }).eq('id', player.id);
    if (saveErr) { setBannerError(`Uploaded, but could not save it: ${saveErr.message}`); setBannerSaving(false); return; }
    const { data } = await supabase.from('players').select('*').eq('id', player.id).single();
    if (data) setPlayer(data);
    setBannerSaving(false);
  };

  const handleRemoveBanner = async () => {
    if (!player) return;
    setBannerSaving(true);
    setBannerError('');
    const { error } = await supabase.from('players').update({ banner_url: null }).eq('id', player.id);
    if (error) { setBannerError(`Could not remove that banner: ${error.message}`); setBannerSaving(false); return; }
    const { data } = await supabase.from('players').select('*').eq('id', player.id).single();
    if (data) setPlayer(data);
    setBannerSaving(false);
  };

  // Saves on tap. Reverted with a reason on failure, like the toggles.
  const handleSelectAccent = async (hex: string | null) => {
    if (!player) return;
    const previous = accentColor;
    setAccentColor(hex);
    setProfileError('');
    const { error } = await supabase.from('players').update({ accent_color: hex }).eq('id', player.id);
    if (error) {
      setAccentColor(previous);
      setProfileError(isMissingSchemaObject(error)
        ? 'Accent colours are not switched on yet — check back after the next update.'
        : `Could not save that colour: ${error.message}`);
    }
  };

  const handleSelectIcon = async (icon: string) => {
    if (!player) return;
    setAvatarSaving(true);
    setAvatarError('');
    await supabase.from('players').update({ avatar_url: icon }).eq('id', player.id);
    // Refresh player in store
    const { data } = await supabase.from('players').select('*').eq('id', player.id).single();
    if (data) setPlayer(data);
    setAvatarSaving(false);
    setShowIconPicker(false);
  };

  const handlePhotoUpload = async (file: File) => {
    if (!player || !profile) return;
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Photo must be under 5 MB.'); return; }
    setAvatarSaving(true);
    setAvatarError('');
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${profile.id}/avatar.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (uploadErr) { setAvatarError(uploadErr.message); setAvatarSaving(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    await supabase.from('players').update({ avatar_url: publicUrl }).eq('id', player.id);
    const { data } = await supabase.from('players').select('*').eq('id', player.id).single();
    if (data) setPlayer(data);
    setAvatarSaving(false);
    setShowIconPicker(false);
  };

  const handleRemoveAvatar = async () => {
    if (!player) return;
    setAvatarSaving(true);
    await supabase.from('players').update({ avatar_url: null }).eq('id', player.id);
    const { data } = await supabase.from('players').select('*').eq('id', player.id).single();
    if (data) setPlayer(data);
    setAvatarSaving(false);
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

            {/* Avatar section */}
            <div className="flex items-center gap-4 mb-5">
              <div className="relative">
                <Avatar player={player} size={64} />
                <button
                  onClick={() => setShowIconPicker(!showIconPicker)}
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#C62828] flex items-center justify-center border-2 border-[#0D0D0D]"
                >
                  <Camera size={11} className="text-white" />
                </button>
              </div>
              <div>
                <div className="font-[Bebas_Neue] text-2xl text-[#E8E2D6]">{player.full_name}</div>
                <div className="text-[#9CA3AF] text-sm font-[Barlow]">{profile?.email}</div>
                <div className="text-[#C62828] font-[Azeret_Mono] text-sm">
                  Rank #{myRanking.ranking.position}
                </div>
              </div>
            </div>

            {/* Avatar picker */}
            {showIconPicker && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-5 bg-[#1A1A1A] rounded-xl p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[#9CA3AF] text-sm font-[Barlow]">Choose an icon or upload a photo</span>
                  <button onClick={() => setShowIconPicker(false)} className="text-[#6B7280]"><X size={16} /></button>
                </div>

                {/* Preset icons */}
                <div className="grid grid-cols-6 gap-2 mb-3">
                  {PRESET_ICONS.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => handleSelectIcon(icon)}
                      disabled={avatarSaving}
                      className={`aspect-square rounded-xl flex items-center justify-center text-2xl transition-all active:scale-95 ${
                        player.avatar_url === icon
                          ? 'bg-[#C62828]/30 border border-[#C62828]/60'
                          : 'bg-[#252525] border border-[#333] hover:border-[#555]'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>

                {/* Upload button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePhotoUpload(file);
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    loading={avatarSaving}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera size={14} /> Upload Photo
                  </Button>
                  {player.avatar_url && (
                    <Button variant="ghost" size="sm" loading={avatarSaving} onClick={handleRemoveAvatar}>
                      Remove
                    </Button>
                  )}
                </div>
                {avatarError && <p className="text-[#EF4444] text-xs font-[Barlow] mt-2">{avatarError}</p>}
              </motion.div>
            )}

            {/* Display name */}
            <div className="mb-4">
              <label className="block text-[#9CA3AF] text-sm font-[Barlow] mb-2 flex items-center gap-1">
                <User size={14} /> Display Name
              </label>
              <div className="flex gap-2">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={player.full_name}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Barlow] text-sm focus:outline-none focus:border-[#C62828] transition-colors"
                />
                <Button variant="secondary" size="sm" loading={saving} onClick={handleSaveName}>
                  Save
                </Button>
              </div>
            </div>

            {/* Bio */}
            <div className="mb-4">
              <label className="block text-[#9CA3AF] text-sm font-[Barlow] mb-2 flex items-center gap-1">
                <FileText size={14} /> Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder="A few words about your game…"
                className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Barlow] text-sm focus:outline-none focus:border-[#C62828] transition-colors resize-none"
              />
              <div className="text-right text-xs text-[#6B7280] font-[Barlow] mt-1">
                {bio.length}/200
              </div>
            </div>

            {/* Preferred discipline */}
            <div className="mb-5">
              <label className="block text-[#9CA3AF] text-sm font-[Barlow] mb-2">
                Preferred Discipline
              </label>
              <div className="flex gap-2">
                {DISCIPLINES.map((d) => (
                  <button
                    key={d}
                    onClick={() => setPreferredDisc(preferredDisc === d ? '' : d)}
                    className={[
                      'flex-1 py-2 rounded-lg text-xs font-[Barlow] font-medium border transition-all',
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

            {/* Nickname + tagline */}
            <div className="mb-4">
              <label className="block text-[#9CA3AF] text-sm font-[Barlow] mb-2">Nickname</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={24}
                placeholder="What they call you at the table"
                className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Barlow] text-sm focus:outline-none focus:border-[#C62828] transition-colors"
              />
            </div>

            <div className="mb-4">
              <label className="block text-[#9CA3AF] text-sm font-[Barlow] mb-2">Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                maxLength={80}
                placeholder="A line that shows on your profile"
                className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Barlow] text-sm focus:outline-none focus:border-[#C62828] transition-colors"
              />
              <div className="text-right text-xs text-[#6B7280] font-[Barlow] mt-1">{tagline.length}/80</div>
            </div>

            {/* Banner and accent both save on tap rather than waiting for Save
                Profile: the change is visible immediately, which is what makes
                picking a colour feel like picking a colour. */}
            <div className="mb-5">
              <label className="block text-[#9CA3AF] text-sm font-[Barlow] mb-2">Profile Banner</label>
              <div className="flex items-center gap-3">
                <div className="relative w-full h-16 rounded-lg overflow-hidden bg-[#252525] border border-[#333] flex items-center justify-center">
                  {player.banner_url ? (
                    <>
                      <img src={player.banner_url} alt="Your profile banner" className="w-full h-full object-cover" />
                      <button
                        onClick={handleRemoveBanner}
                        disabled={bannerSaving}
                        aria-label="Remove banner"
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <span className="text-[#6B7280] text-xs font-[Barlow]">No banner yet</span>
                  )}
                </div>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleBannerUpload(file);
                  }}
                />
                <Button variant="secondary" size="sm" loading={bannerSaving} onClick={() => bannerInputRef.current?.click()}>
                  {player.banner_url ? 'Change' : 'Upload'}
                </Button>
              </div>
              {bannerError && <p className="text-[#EF4444] text-xs font-[Barlow] mt-2">{bannerError}</p>}

              <label className="block text-[#9CA3AF] text-sm font-[Barlow] mt-4 mb-2">Accent Colour</label>
              <div className="flex flex-wrap gap-2 items-center">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => handleSelectAccent(c.hex)}
                    aria-label={c.name}
                    title={c.name}
                    className={[
                      'w-8 h-8 rounded-full border transition-all active:scale-95',
                      accentColor === c.hex ? 'border-white ring-2 ring-white/40' : 'border-[#333]',
                    ].join(' ')}
                    style={{ background: c.hex }}
                  />
                ))}
                {accentColor && (
                  <button
                    type="button"
                    onClick={() => handleSelectAccent(null)}
                    className="text-[#6B7280] text-xs font-[Barlow] underline ml-2"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Home venue */}
            <div className="mb-4">
              <label className="block text-[#9CA3AF] text-sm font-[Barlow] mb-2">Home Venue</label>
              <select
                value={homeVenue}
                onChange={(e) => setHomeVenue(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Barlow] text-sm focus:outline-none focus:border-[#C62828]"
              >
                <option value="">No preference</option>
                {venues.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-5">
              <div>
                <label className="block text-[#9CA3AF] text-sm font-[Barlow] mb-2">Years Playing</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={90}
                  value={yearsPlaying}
                  onChange={(e) => setYearsPlaying(e.target.value)}
                  placeholder="—"
                  className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Barlow] text-sm focus:outline-none focus:border-[#C62828]"
                />
              </div>
              <div>
                <label className="block text-[#9CA3AF] text-sm font-[Barlow] mb-2">Cue</label>
                <input
                  type="text"
                  value={cueBrand}
                  onChange={(e) => setCueBrand(e.target.value)}
                  maxLength={40}
                  placeholder="Predator, McDermott…"
                  className="w-full px-3 py-2.5 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Barlow] text-sm focus:outline-none focus:border-[#C62828]"
                />
              </div>
            </div>

            {profileError && (
              <p className="text-[#EF4444] text-xs font-[Barlow] mb-3">{profileError}</p>
            )}
            {profileSaved && (
              <p className="text-[#22C55E] text-xs font-[Barlow] mb-3">Saved — this is what other players see.</p>
            )}

            <Button variant="primary" fullWidth loading={saving} onClick={handleSaveProfile}>
              Save Profile
            </Button>

            <div className="text-xs text-[#6B7280] font-[Barlow] mt-3">
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
                <div className="font-[Barlow] font-medium text-[#E8E2D6] text-sm">Sound Effects</div>
                <div className="text-[#6B7280] text-xs font-[Barlow]">UI sounds and celebrations</div>
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
                  <div className="font-[Barlow] font-medium text-[#E8E2D6] text-sm">Push Notifications</div>
                  <div className="text-[#6B7280] text-xs font-[Barlow]">
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
                <div className="font-[Barlow] font-semibold text-[#E8E2D6]">Admin Dashboard</div>
                <div className="text-[#9CA3AF] text-xs font-[Barlow]">Disputes, treasury, player management</div>
              </div>
              <div className="ml-auto text-[#6B7280]">→</div>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* League rules */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <GlassCard className="p-5" hover onClick={() => navigate('/rules')}>
          <div className="flex items-center gap-3">
            <span className="text-xl">📖</span>
            <div>
              <div className="font-[Barlow] font-semibold text-[#E8E2D6]">League Rules</div>
              <div className="text-[#9CA3AF] text-xs font-[Barlow]">Challenges, cooldowns, forfeits, fees — how the ladder works</div>
            </div>
            <div className="ml-auto text-[#6B7280]">→</div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Notifications — these are enforced server-side by a trigger on the
          notifications table, so switching one off stops it everywhere, not just
          in this app's UI. */}
      {player && prefsSupported !== false && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <GlassCard className="p-5 mb-4">
            <h2 className="font-[Bebas_Neue] text-xl text-[#E8E2D6] mb-1">Notify Me About</h2>
            <p className="text-[#6B7280] text-xs font-[Barlow] mb-3">
              Forfeits, disputes and anything affecting your rank or the treasury always come through.
            </p>

            {prefsError && <p className="text-[#EF4444] text-xs font-[Barlow] mb-2">{prefsError}</p>}

            {!prefs ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
              </div>
            ) : (
              <>
                <ToggleRow
                  icon={<Swords size={18} />}
                  title="Challenges"
                  description="New challenges, replies and scheduling"
                  checked={prefs.notify_challenges}
                  onChange={(v) => setPreference('notify_challenges', v)}
                />
                <ToggleRow
                  icon={<Clock size={18} />}
                  title="Match Reminders"
                  description="A nudge before your match starts"
                  checked={prefs.notify_reminders}
                  onChange={(v) => setPreference('notify_reminders', v)}
                />
                <ToggleRow
                  icon={<Trophy size={18} />}
                  title="Results"
                  description="Submitted and confirmed match results"
                  checked={prefs.notify_results}
                  onChange={(v) => setPreference('notify_results', v)}
                />
                <ToggleRow
                  icon={<Bell size={18} />}
                  title="League Activity"
                  description="Rank changes and new members"
                  checked={prefs.notify_activity}
                  onChange={(v) => setPreference('notify_activity', v)}
                />
                <ToggleRow
                  icon={<BellOff size={18} />}
                  title="Send to My Phone"
                  description="Master switch for push notifications"
                  checked={prefs.push_enabled}
                  onChange={(v) => setPreference('push_enabled', v)}
                />
              </>
            )}
          </GlassCard>
        </motion.div>
      )}

      {/* Privacy */}
      {player && prefs && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <GlassCard className="p-5 mb-4">
            <h2 className="font-[Bebas_Neue] text-xl text-[#E8E2D6] mb-1">What Others See</h2>
            <p className="text-[#6B7280] text-xs font-[Barlow] mb-3">
              Your name, rank and match history stay on the ladder either way — that's the league record.
            </p>
            <ToggleRow
              icon={<Trophy size={18} />}
              title="Detailed Stats"
              description="Your by-discipline and by-venue breakdowns"
              checked={prefs.show_stats_publicly}
              onChange={(v) => setPreference('show_stats_publicly', v)}
            />
            <ToggleRow
              icon={<User size={18} />}
              title="Profile Details"
              description="Nickname, tagline, bio, cue and home venue"
              checked={prefs.show_profile_details}
              onChange={(v) => setPreference('show_profile_details', v)}
            />
          </GlassCard>
        </motion.div>
      )}

      {/* App info */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
        <GlassCard className="p-5">
          <h2 className="font-[Bebas_Neue] text-xl text-[#E8E2D6] mb-3">About</h2>
          <div className="space-y-1 text-[#9CA3AF] text-sm font-[Barlow]">
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
