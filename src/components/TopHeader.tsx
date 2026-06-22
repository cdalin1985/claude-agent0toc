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
      className="fixed top-0 left-0 right-0 z-50 bg-slate-900 border-b border-slate-800"
      initial={{ y: -64 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between h-16 px-4">
        {/* Logo/Branding */}
        <div className="flex items-center gap-2">
          <div className="text-lg font-bold text-red-500">TOC</div>
          <div className="text-xs text-slate-400">Rankings</div>
        </div>

        {/* Menu Toggle */}
        <motion.button
          onClick={onMenuToggle}
          className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
          whileTap={{ scale: 0.95 }}
        >
          <motion.div
            animate={{ rotate: isMenuOpen ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <List size={24} weight="bold" className="text-slate-300" />
          </motion.div>
        </motion.button>
      </div>
    </motion.header>
  );
}
