import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, CheckCircle, Swords } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useRankings } from '../hooks/useRankings';
import { PoolBall } from '../components/PoolBall';
import { GlassCard } from '../components/GlassCard';
import { Button } from '../components/Button';
import { supabase } from '../lib/supabase';

type Discipline = '8 Ball' | '9 Ball' | '10 Ball';

const DISCIPLINES: { value: Discipline; emoji: string; desc: string }[] = [
  { value: '8 Ball', emoji: '🎱', desc: 'Classic — pocket the 8 ball last' },
  { value: '9 Ball', emoji: '🔵', desc: 'Fast-paced — lowest ball first' },
  { value: '10 Ball', emoji: '🟡', desc: 'Strategic — call-shot 10 ball' },
];

const RACE_OPTIONS = [5, 7, 9, 11, 13, 15];

export default function ChallengePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { player } = useAuthStore();
  const { data: rankings = [] } = useRankings();

  const target = rankings.find((r) => r.player.id === id);

  const [step, setStep]             = useState(1);
  const [discipline, setDiscipline] = useState<Discipline | null>(null);
  const [race, setRace]             = useState(7);
  const [feeChecked, setFeeChecked] = useState(false);
  const [sending, setSending]       = useState(false);
  const [sent, setSent]             = useState(false);
  const [error, setError]           = useState('');

  if (!target) return null;

  const handleSend = async () => {
    if (!discipline) return;
    setSending(true);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        challenged_player_id: id,
        discipline,
        race_length: race,
      }),
    });
    const json = await res.json() as { challenge_id?: string; error?: string };
    setSending(false);
    if (json.error) { setError(json.error); return; }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-7xl mb-6"
          >
            ⚔️
          </motion.div>
          <h1 className="font-[Bebas_Neue] text-5xl text-[#E8E2D6] mb-2">Challenge Sent!</h1>
          <p className="text-[#9CA3AF] font-[Outfit] mb-8">
            {target.player.full_name} has been challenged to {discipline}!
          </p>
          <PoolBall position={target.ranking.position} size={80} className="mx-auto mb-8" />
          <Button variant="secondary" onClick={() => navigate('/challenges')}>
            View My Challenges
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pt-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => (step > 1 ? setStep(step - 1) : navigate(-1))} className="p-2">
          <ChevronLeft size={24} className="text-[#9CA3AF]" />
        </button>
        <div>
          <div className="text-[#6B7280] text-xs font-[Outfit]">Step {step} of 3</div>
          <h1 className="font-[Bebas_Neue] text-3xl text-[#E8E2D6]">
            {step === 1 ? 'Choose Discipline' : step === 2 ? 'Set Race Length' : 'Confirm & Send'}
          </h1>
        </div>
      </div>

      {/* Opponent preview */}
      <GlassCard className="p-4 flex items-center gap-3 mb-6">
        <PoolBall position={target.ranking.position} size={44} />
        <div>
          <div className="font-[Outfit] font-semibold text-[#E8E2D6]">{target.player.full_name}</div>
          <div className="text-[#9CA3AF] text-xs font-[JetBrains_Mono]">Rank #{target.ranking.position}</div>
        </div>
        <div className="ml-auto text-2xl">VS</div>
        {player && (() => {
          const myR = rankings.find((r) => r.player.id === player.id);
          return myR ? <PoolBall position={myR.ranking.position} size={44} /> : null;
        })()}
      </GlassCard>

      {/* Progress dots */}
      <div className="flex justify-center gap-2 mb-6">
        {[1,2,3].map((s) => (
          <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${s === step ? 'w-6 bg-[#C62828]' : s < step ? 'w-3 bg-[#C62828]/50' : 'w-3 bg-[#333]'}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-3"
          >
            {DISCIPLINES.map((d) => (
              <GlassCard
                key={d.value}
                hover
                onClick={() => setDiscipline(d.value)}
                className="p-5 flex items-center gap-4"
                glow={discipline === d.value}
              >
                <span className="text-4xl">{d.emoji}</span>
                <div className="flex-1">
                  <div className="font-[Bebas_Neue] text-2xl text-[#E8E2D6]">{d.value}</div>
                  <div className="text-[#9CA3AF] text-sm font-[Outfit]">{d.desc}</div>
                </div>
                {discipline === d.value && <CheckCircle size={20} className="text-[#C62828] shrink-0" />}
              </GlassCard>
            ))}
            <div className="pt-4">
              <Button variant="primary" fullWidth size="lg" disabled={!discipline} onClick={() => setStep(2)}>
                Next <ChevronRight size={18} />
              </Button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <GlassCard className="p-6 text-center">
              <div className="text-[#9CA3AF] font-[Outfit] text-sm mb-2">Race Length</div>
              <div className="font-[JetBrains_Mono] font-bold text-6xl text-[#E8E2D6]">{race}</div>
              <div className="text-[#C62828] font-[Outfit] text-sm mt-1">First to {race} wins</div>
            </GlassCard>

            <div className="grid grid-cols-3 gap-3">
              {RACE_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRace(r)}
                  className={[
                    'py-4 rounded-xl font-[JetBrains_Mono] font-bold text-2xl transition-all duration-200',
                    race === r
                      ? 'bg-[#C62828] text-white shadow-[0_0_16px_rgba(198,40,40,0.4)]'
                      : 'bg-[#1A1A1A] border border-[#333] text-[#9CA3AF]',
                  ].join(' ')}
                >
                  {r}
                </button>
              ))}
            </div>

            <Button variant="primary" fullWidth size="lg" onClick={() => setStep(3)}>
              Next <ChevronRight size={18} />
            </Button>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {/* Summary */}
            <GlassCard className="p-5 space-y-4">
              <h3 className="font-[Bebas_Neue] text-xl text-[#E8E2D6]">Challenge Summary</h3>
              <div className="space-y-3">
                {[
                  { label: 'Opponent', value: target.player.full_name },
                  { label: 'Their Rank', value: `#${target.ranking.position}` },
                  { label: 'Discipline', value: discipline ?? '' },
                  { label: 'Race', value: `First to ${race}` },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center">
                    <span className="text-[#9CA3AF] text-sm font-[Outfit]">{row.label}</span>
                    <span className="text-[#E8E2D6] font-[JetBrains_Mono] font-semibold text-sm">{row.value}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Fee notice */}
            <GlassCard className="p-4">
              <div className="text-[#F59E0B] text-sm font-[Outfit] leading-relaxed mb-3">
                💰 <strong>Entry Fee: $5</strong> via Venmo @TopOfTheCapital.
                Please send before match day.
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={feeChecked}
                  onChange={(e) => setFeeChecked(e.target.checked)}
                  className="w-5 h-5 rounded accent-[#C62828]"
                />
                <span className="text-[#E8E2D6] text-sm font-[Outfit]">
                  I understand the entry fee requirement
                </span>
              </label>
            </GlassCard>

            {error && (
              <div className="text-[#EF4444] text-sm font-[Outfit] text-center p-3 bg-[#EF4444]/10 rounded-lg border border-[#EF4444]/20">
                {error}
              </div>
            )}

            <Button
              variant="primary"
              fullWidth
              size="lg"
              loading={sending}
              disabled={!feeChecked}
              onClick={handleSend}
            >
              <Swords size={18} /> Send Challenge ⚔️
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
