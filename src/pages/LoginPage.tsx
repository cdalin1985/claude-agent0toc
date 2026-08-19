import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, KeyRound, AlertCircle, ArrowLeft, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { humanError } from '../lib/humanError';
import { EKGLine } from '../components/EKGLine';
import { Button } from '../components/Button';

type Step = 'email' | 'code';

// Supabase rate-limits OTP sends at 60s. Matching it here means the button says
// so instead of the server refusing and the player seeing nothing happen.
const RESEND_COOLDOWN_SECONDS = 60;

// Auto-focus the email field only on desktop. On phones it pops the keyboard
// the moment the page loads, covering the title and disorienting first-time visitors.
const SHOULD_AUTO_FOCUS_EMAIL =
  typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

export default function LoginPage() {
  const navigate              = useNavigate();
  const [step, setStep]       = useState<Step>('email');
  const [email, setEmail]     = useState('');
  const [code, setCode]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [resent, setResent]   = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown]   = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'code') {
      setTimeout(() => codeRef.current?.focus(), 150);
    }
  }, [step]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
    });
    setLoading(false);
    // Supabase's own messages here are usually readable ("Email rate limit
    // exceeded"), but a network failure surfaces as the browser's "Failed to
    // fetch", which tells a member nothing and reads like their email was
    // rejected. Keep the useful ones, replace the useless one.
    if (err) { setError(humanError(err.message, "We couldn't reach the league to send your code. Check your connection and try again.")); }
    else     { setStep('code'); setResent(false); }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.replace(/\s/g, '');
    if (trimmed.length !== 8) return;
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: trimmed,
      type: 'email',
    });
    setLoading(false);
    if (err) { setError('Invalid or expired code. Try again.'); }
    else     { navigate('/', { replace: true }); }
  };

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Every player passes through this screen to get in, so a silent failure here
  // blocks onboarding for the whole league.
  //
  // This used to discard the error entirely and had no loading state or
  // disabled guard. Supabase rate-limits OTP, so a second tap inside 60s
  // returns "you can only request this after N seconds" and the player saw
  // absolutely nothing change -- so they tapped again. Worse, each successful
  // resend invalidates the previous code, so a player who tapped twice and then
  // typed the code from the first email got "Invalid or expired code" and had
  // no way to understand why.
  const handleResend = async () => {
    if (resending || cooldown > 0) return;
    setResending(true);
    setError('');
    setCode('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
    });
    setResending(false);
    if (err) {
      setError(humanError(err.message, 'Could not send a new code. Please try again in a minute.'));
      return;
    }
    setResent(true);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const handleCodeChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 8);
    setCode(digits);
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 60%, rgba(198,40,40,0.12) 0%, transparent 65%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="mb-4 flex justify-center"
          >
            <img
              src="/toclogo.png"
              alt="Top of the Capital"
              className="h-28 w-auto object-contain"
            />
          </motion.div>
          <h1
            className="font-[Bebas_Neue] text-6xl tracking-widest leading-none"
            style={{
              color: '#E8E2D6',
              textShadow: '0 0 40px rgba(198,40,40,0.4), 0 2px 8px rgba(0,0,0,0.6)',
            }}
            /*
              The league's name is set on two lines. It was `TOP OF THE<br />CAPITAL`,
              and a <br> is not a word separator in accessible-name computation, so
              screen readers announced "TOP OF THECAPITAL" -- on the first screen
              anyone using one ever reaches.
              Splitting it into two block-level spans does NOT fix it: verified in
              Chrome, the computed name is still "TOP OF THECAPITAL". The accname
              algorithm concatenates the text of child nodes without inserting
              whitespace for block boundaries.
              So the name is stated outright. The spans keep the two-line look; this
              decides what is announced, independent of how it is laid out.
            */
            aria-label="Top of the Capital"
          >
            <span className="block">TOP OF THE</span>
            <span className="block">CAPITAL</span>
          </h1>
          <p className="text-[#9CA3AF] font-[Barlow] text-sm mt-2 tracking-[0.2em] uppercase">
            Helena Pool League
          </p>
          <EKGLine className="mx-auto mt-3" />
          {/* Tagline gives first-time visitors a one-line answer to "what is this?" */}
          <p className="text-[#A1A1AA] font-[Barlow] text-base mt-5 leading-relaxed">
            Track your matches. Climb the ladder.{' '}
            <span className="text-[#E8E2D6] font-semibold">Defend your spot.</span>
          </p>
        </div>

        <AnimatePresence mode="wait">
          {step === 'email' ? (
            <motion.form
              key="email-step"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              onSubmit={handleSendCode}
              className="glass-card p-6 space-y-4"
            >
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-[#9CA3AF] text-sm font-[Barlow] mb-2"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder="your@email.com"
                    autoFocus={SHOULD_AUTO_FOCUS_EMAIL}
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Barlow] text-base placeholder-[#6B7280] focus:outline-none focus:border-[#C62828] focus:ring-1 focus:ring-[#C62828]/30 transition-colors"
                  />
                </div>
                {error && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-1.5 text-[#EF4444] text-sm mt-2 font-[Barlow]"
                  >
                    <AlertCircle size={14} /> {error}
                  </motion.p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                fullWidth
                size="lg"
                loading={loading}
                disabled={!email.trim()}
              >
                <Mail size={16} /> Send Sign-In Code
              </Button>

              {/* Helper bumped from text-xs (12px) to text-sm (14px) for legibility.
                  Fixed: was "6-digit", actual code is 8 digits. */}
              <p className="text-center text-[#A1A1AA] text-sm font-[Barlow] leading-relaxed">
                We'll email you an 8-digit code. No password needed.
              </p>
            </motion.form>
          ) : (
            <motion.form
              key="code-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.25 }}
              onSubmit={handleVerifyCode}
              className="glass-card p-6 space-y-5"
            >
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  onClick={() => { setStep('email'); setCode(''); setError(''); }}
                  aria-label="Back to email step"
                  className="text-[#9CA3AF] hover:text-[#E8E2D6] transition-colors"
                >
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <div className="font-[Barlow] font-semibold text-[#E8E2D6] text-sm">
                    Check your email
                  </div>
                  <div className="text-[#A1A1AA] text-sm font-[Barlow]">
                    Code sent to {email}
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-code"
                  className="flex items-center gap-1.5 text-[#9CA3AF] text-sm font-[Barlow] mb-3"
                >
                  <KeyRound size={14} /> 8-Digit Code
                </label>
                <input
                  id="login-code"
                  name="otp"
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="00000000"
                  maxLength={8}
                  className="w-full px-4 py-4 rounded-lg bg-[#252525] border border-[#333] text-[#E8E2D6] font-[Azeret_Mono] text-3xl text-center tracking-[0.5em] placeholder-[#3A3A3A] focus:outline-none focus:border-[#C62828] focus:ring-1 focus:ring-[#C62828]/30 transition-colors"
                />
                {error && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-1.5 text-[#EF4444] text-sm mt-2 font-[Barlow]"
                  >
                    <AlertCircle size={14} /> {error}
                  </motion.p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                fullWidth
                size="lg"
                loading={loading}
                disabled={code.replace(/\s/g, '').length !== 8}
              >
                Sign In
              </Button>

              <div className="text-center">
                {resent && cooldown > 0 ? (
                  <p className="text-[#22C55E] text-sm font-[Barlow]">
                    New code sent — use the newest email. You can ask again in {cooldown}s.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending || cooldown > 0}
                    className="text-[#9CA3AF] text-sm font-[Barlow] underline underline-offset-2 hover:text-[#E8E2D6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                  >
                    {resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </button>
                )}
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Quiet help link below the card. First-time visitors and locked-out members
            need an escape hatch — there was no contact path before. */}
        <div className="mt-5 text-center">
          <a
            href="mailto:help@toc.monster?subject=TOC%20sign-in%20help"
            className="inline-flex items-center gap-1.5 text-[#9CA3AF] hover:text-[#E8E2D6] text-sm font-[Barlow] transition-colors"
          >
            <HelpCircle size={14} /> Trouble signing in?
          </a>
        </div>
      </motion.div>
    </div>
  );
}
