import React from 'react';
import { motion } from 'framer-motion';

interface SkeletonProps {
  width?: string;
  height?: string;
  className?: string;
  count?: number;
  circle?: boolean;
}

export function Skeleton({
  width = '100%',
  height = '16px',
  className = '',
  count = 1,
  circle = false,
}: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className={skeleton {className}}
          style={{
            width,
            height,
            borderRadius: circle ? '50%' : '8px',
            marginBottom: count > 1 && i < count - 1 ? '12px' : 0,
          }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      ))}
    </>
  );
}

export function SkeletonRankingCard() {
  return (
    <div className="glass-card p-4 mb-3 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <Skeleton width="60px" height="20px" />
        <Skeleton width="100px" height="20px" />
      </div>
      <Skeleton width="100%" height="14px" count={2} />
    </div>
  );
}

export function SkeletonMatchCard() {
  return (
    <div className="glass-card p-4 mb-3 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <Skeleton width="80px" height="18px" />
        <Skeleton width="40px" height="24px" />
      </div>
      <div className="flex justify-between items-center">
        <Skeleton width="90px" height="16px" />
        <Skeleton width="30px" height="30px" circle />
        <Skeleton width="90px" height="16px" />
      </div>
    </div>
  );
}
