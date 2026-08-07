import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { Button } from './Button';

const STEPS = [
  {
    icon: '🎱',
    title: "You're on the ladder",
    body: 'You hold a rank on the single unified list. Climb by beating players above you — boxing-style, no seasons.',
  },
  {
    icon: '⚔️',
    title: 'Challenge up',
    body: 'Tap a player ranked above you (within range) to challenge them. Win and you take their spot — everyone between drops one.',
  },
  {
    icon: '🏆',
    title: 'Play & score',
    body: 'One of you keeps score live in the app. When the race is done, both submit the result and confirm how you paid the $5 fee.',
  },
  {
    icon: '⚙️',
    title: 'Make it yours',
    body: 'In Settings: upload a photo, write a bio, pick a theme, and turn on push notifications so you never miss a challenge.',
  },
];

const DISMISS_KEY = 'toc-onboarding-dismissed';

export function OnboardingTour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(() => {
    if (localStorage.getItem(DISMISS_KEY) === '1') return false;
    return localStorage.getItem('toc-new-user') === '1';
  });

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
          onClick={dismiss}
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="glass-card p-6 w-full max-w-sm text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-5xl mb-4">{current.icon}</div>
            <h2 className="font-[Bebas_Neue] text-3xl text-[#E8E2D6] mb-2">{current.title}</h2>
            <p className="text-[#9CA3AF] text-sm font-[Barlow] leading-snug mb-6">{current.body}</p>

            <div className="flex justify-center gap-1.5 mb-5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-200 ${i === step ? 'w-5 bg-[#C62828]' : 'w-1.5 bg-[#333]'}`}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" fullWidth onClick={dismiss}>Skip</Button>
              <Button variant="primary" fullWidth onClick={next}>
                {isLast ? 'Got it' : 'Next'}
                {!isLast && <ChevronRight size={14} />}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}