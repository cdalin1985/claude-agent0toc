import React from 'react';
import { motion } from 'framer-motion';
import { List } from '@phosphor-icons/react';

interface TopHeaderProps {
  onMenuToggle: () => void;
  isMenuOpen: boolean;
}

export function TopHeader({ onMenuToggle, isMenuOpen }: TopHeaderProps) {
  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-50 border-b"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        borderColor: 'var(--color-border-default)',
      }}
      initial={{ y: -64 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between h-16 px-4">
        {/* Logo/Branding */}
        <div className="flex items-center gap-2">
          <div className="text-lg font-bold" style={{ color: 'var(--color-accent-primary)' }}>TOC</div>
          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Rankings</div>
        </div>

        {/* Menu Toggle */}
        <motion.button
          onClick={onMenuToggle}
          className="p-2 rounded-lg transition-colors hover:opacity-80"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.div
            animate={{ rotate: isMenuOpen ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <List size={24} weight="bold" style={{ color: 'var(--color-text-secondary)' }} />
          </motion.div>
        </motion.button>
      </div>
    </motion.header>
  );
}
