import React from 'react';
import { motion } from 'framer-motion';
import { Sword } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

interface FloatingActionButtonProps {
  show: boolean;
}

export function FloatingActionButton({ show }: FloatingActionButtonProps) {
  const navigate = useNavigate();
  const { player } = useAuthStore();

  if (!show || !player) return null;

  return (
    <motion.button
      onClick={() => navigate('/rankings?challenge=1')}
      className="fixed bottom-24 right-4 z-40 rounded-full shadow-lg hover:shadow-xl transition-shadow"
      style={{
        width: '56px',
        height: '56px',
        backgroundColor: 'var(--color-accent-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      title="New Challenge"
    >
      <Sword size={24} weight="bold" color="white" />
    </motion.button>
  );
}
