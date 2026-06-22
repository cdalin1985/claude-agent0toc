import React from 'react';
import { motion } from 'framer-motion';
import { Button } from './Button';

interface QueryErrorProps {
  title?: string;
  message?: string;
  onRetry: () => void;
  retrying?: boolean;
}

export const QueryError: React.FC<QueryErrorProps> = ({
  title = 'Connection Trouble',
  message = "Couldn't load league data. Check your signal and try again.",
  onRetry,
  retrying = false,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-16 px-6 text-center"
  >
    <span className="text-5xl mb-4">📡</span>
    <h3 className="font-[Bebas_Neue] text-2xl text-[#E8E2D6] mb-2">{title}</h3>
    <p className="text-[#9CA3AF] text-sm max-w-[260px] leading-relaxed font-[Barlow]">{message}</p>
    <div className="mt-6">
      <Button variant="secondary" loading={retrying} onClick={onRetry}>
        Try Again
      </Button>
    </div>
  </motion.div>
);
