import React from 'react';
import { motion } from 'framer-motion';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  gold?: boolean; // top-3 gold shimmer
  glow?: boolean; // crimson glow (your own row)
  as?: 'div' | 'button' | 'li';
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  hover = false,
  onClick,
  gold = false,
  glow = false,
  as: Tag = 'div',
}) => {
  const base =
    'glass-card ' +
    (gold ? 'gold-shimmer ' : '') +
    (hover ? 'glass-card-hover cursor-pointer ' : '') +
    (glow ? 'border-[#C62828]/40 shadow-[0_0_20px_rgba(198,40,40,0.15)] ' : '') +
    className;

  if (onClick) {
    return (
      <motion.div
        className={base}
        onClick={onClick}
        whileTap={{ scale: 0.98 }}
        style={glow ? { borderColor: 'rgba(198,40,40,0.35)' } : undefined}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div className={base} style={glow ? { borderColor: 'rgba(198,40,40,0.35)' } : undefined}>
      {children}
    </div>
  );
};
