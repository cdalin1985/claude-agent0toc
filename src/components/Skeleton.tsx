import React from 'react';

interface SkeletonProps {
  className?: string;
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', count = 1 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className={`skeleton ${className}`} />
    ))}
  </>
);

export const RankingRowSkeleton: React.FC = () => (
  <div className="glass-card p-4 flex items-center gap-3">
    <Skeleton className="w-12 h-12 rounded-full" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
    <Skeleton className="h-8 w-20 rounded-lg" />
  </div>
);

export const CardSkeleton: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div className="glass-card p-5 space-y-3">
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={`h-4 ${i === 0 ? 'w-2/3' : i % 2 === 0 ? 'w-full' : 'w-4/5'}`} />
    ))}
  </div>
);
