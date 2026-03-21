import React from 'react';

// Pool ball colors by rank position (1-indexed, cycles every 15)
const BALL_COLORS: Record<number, { color: string; stripe: boolean }> = {
  1:  { color: '#F5D800', stripe: false },
  2:  { color: '#003DA5', stripe: false },
  3:  { color: '#CC0000', stripe: false },
  4:  { color: '#5B0E91', stripe: false }, // purple
  5:  { color: '#FF5500', stripe: false },
  6:  { color: '#006341', stripe: false },
  7:  { color: '#7B0323', stripe: false },
  8:  { color: '#1A1A1A', stripe: false },
  9:  { color: '#F5D800', stripe: true },
  10: { color: '#003DA5', stripe: true },
  11: { color: '#CC0000', stripe: true },
  12: { color: '#5B0E91', stripe: true },
  13: { color: '#FF5500', stripe: true },
  14: { color: '#006341', stripe: true },
  15: { color: '#7B0323', stripe: true },
};

function getBallConfig(position: number): { color: string; stripe: boolean } {
  const idx = ((position - 1) % 15) + 1;
  return BALL_COLORS[idx] ?? { color: '#1A1A1A', stripe: false };
}

interface PoolBallProps {
  position: number;
  size?: number;
  className?: string;
}

export const PoolBall: React.FC<PoolBallProps> = ({ position, size = 48, className = '' }) => {
  const { color, stripe } = getBallConfig(position);
  const num = position;
  const fontSize = size < 36 ? size * 0.35 : size * 0.3;
  const circleR = size * 0.22;
  // Text color: white for dark balls, dark for yellow/orange
  const isDark = ['#003DA5','#5B0E91','#006341','#7B0323','#1A1A1A','#CC0000'].includes(color);
  const numColor = isDark ? '#FFFFFF' : '#1A1A1A';
  const bgNumColor = stripe ? '#1A1A1A' : numColor;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-label={`Pool ball ${num}`}
    >
      <defs>
        {/* 3D sphere gradient — light from top-left */}
        <radialGradient id={`sphere-${num}-${size}`} cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
          <stop offset="40%" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
        </radialGradient>
        {/* Gloss streak */}
        <radialGradient id={`gloss-${num}-${size}`} cx="38%" cy="25%" r="30%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.6)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <clipPath id={`clip-${num}-${size}`}>
          <circle cx={size/2} cy={size/2} r={size/2 - 1} />
        </clipPath>
      </defs>

      {/* Base circle — ball color (or white for stripe balls) */}
      <circle
        cx={size/2} cy={size/2} r={size/2 - 1}
        fill={stripe ? '#F5F5F5' : color}
      />

      {/* Stripe band for striped balls */}
      {stripe && (
        <rect
          x={0} y={size * 0.3} width={size} height={size * 0.4}
          fill={color}
          clipPath={`url(#clip-${num}-${size})`}
        />
      )}

      {/* White number circle background */}
      <circle cx={size/2} cy={size/2} r={circleR} fill="white" opacity={0.92} />

      {/* Ball number */}
      <text
        x={size/2} y={size/2}
        textAnchor="middle" dominantBaseline="central"
        fontSize={fontSize}
        fontFamily="'JetBrains Mono', monospace"
        fontWeight="600"
        fill={bgNumColor}
      >
        {num > 99 ? '…' : num}
      </text>

      {/* 3D sphere overlay */}
      <circle
        cx={size/2} cy={size/2} r={size/2 - 1}
        fill={`url(#sphere-${num}-${size})`}
      />

      {/* Gloss highlight */}
      <circle
        cx={size/2} cy={size/2} r={size/2 - 1}
        fill={`url(#gloss-${num}-${size})`}
      />

      {/* Outer ring */}
      <circle
        cx={size/2} cy={size/2} r={size/2 - 1}
        fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1"
      />
    </svg>
  );
};
