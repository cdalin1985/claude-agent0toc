import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EKGLine } from '../components/EKGLine';
import { Button } from '../components/Button';

type State = 'idle' | 'sending' | 'sent' | 'error';

export default function LoginPage() {
  const [email, setEmail]   = useState('');
  const [state, setState]   = useState<State>('idle');
  const [error, setError]   = useState('');

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setState('sending');
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) { setState('error'); setError(err.message); }
    else       setState('sent');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Background crimson pulse */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 60%, rgba(198,40,40,0.12) 0%, transparent 65%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="text-6xl mb-4"
          >
            🎱
          </motion.div>
          <h1
            className="font-[Bebas_Neue] text-6xl tracking-widest leading-none"
            style={{
              color: '#E8E2D6',
              textShadow: '0 0 40px rgba(198,40,40,0.4), 0 2px 8px rgba(0,0,0,0.6)',
            }}
          >
            TOP OF THE<br />CAPITAL
          </h1>
          <p className="text-[#9CA3AF] font-[Outfit] text-sm mt-2 tracking-[0.2em] uppercase">
            Helena Pool League
          </p>
          <EKGLine className="mx-auto mt-3" />
        </div>

        {state === 'sent' ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-8 text-center"
          >
            <CheckCircle size={48} className="text-[#22C55E] mx-auto mb-4" />
            <h2 className="font-[Bebas_Neue] text-3xl text-[#E8E2D6] mb-2">Check Your Email</h2>
            <p className="text-[#9CA3AF] font-[Outfit] text-sm leading-relaxed">
              We sent a magic link to <strong className="text-[#E8E2D6]">{email}</strong>.
              <br />Tap the link to sign in — no password needed.
            </p>
            <button
              onClick={() => setState('idle')}
              className="mt-6 text-[#9CA3AF] text-sm underline underline-offset-2"
            >
              Use a different email
            </button>
          </motion.div>
        ) : (
          <form onSubmit={handleSend} className="glass-card p-6 space-y-4">
            <div>
              <label className="block text-[#9CA3AF] text-sm font-[Outfit] mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Outfit] text-base placeholder-[#6B7280] focus:outline-none focus:border-[#C62828] focus:ring-1 focus:ring-[#C62828]/30 transition-colors"
                />
              </div>
              {state === 'error' && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-1.5 text-[#EF4444] text-xs mt-2 font-[Outfit]"
                >
                  <AlertCircle size={12} /> {error}
                </motion.p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              size="lg"
              loading={state === 'sending'}
              disabled={!email.trim()}
            >
              Send Magic Link ✨
            </Button>

            <p className="text-center text-[#6B7280] text-xs font-[Outfit] leading-relaxed">
              No password needed. We'll email you a one-tap login link.
            </p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
