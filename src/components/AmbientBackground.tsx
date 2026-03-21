import React, { useEffect, useRef } from 'react';

const Particle: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <div
    className="absolute rounded-full bg-white pointer-events-none"
    style={{
      width: '2px',
      height: '2px',
      opacity: 0,
      animation: `float-up ${3 + Math.random() * 4}s ease-in-out infinite`,
      ...style,
    }}
  />
);

export const AmbientBackground: React.FC = () => {
  // Generate stable particle positions (not random on every render)
  const particles = useRef(
    Array.from({ length: 18 }, (_, i) => ({
      left: `${(i * 5.5 + 3) % 95}%`,
      bottom: `${(i * 7 + 5) % 40}%`,
      delay: `${(i * 0.4) % 6}s`,
    }))
  );

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden>
      {/* Crimson orb — top left */}
      <div
        style={{
          position: 'absolute',
          top: '15%',
          left: '-8%',
          width: '520px',
          height: '520px',
          background: 'radial-gradient(circle, rgba(198,40,40,0.09) 0%, transparent 70%)',
          filter: 'blur(80px)',
          animation: 'drift1 22s ease-in-out infinite',
        }}
      />
      {/* Gold orb — bottom right */}
      <div
        style={{
          position: 'absolute',
          bottom: '8%',
          right: '-8%',
          width: '420px',
          height: '420px',
          background: 'radial-gradient(circle, rgba(212,175,55,0.07) 0%, transparent 70%)',
          filter: 'blur(80px)',
          animation: 'drift2 28s ease-in-out infinite',
        }}
      />
      {/* Subtle center glow */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(198,40,40,0.03) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      {/* Floating dust particles */}
      {particles.current.map((p, i) => (
        <Particle
          key={i}
          style={{
            left: p.left,
            bottom: p.bottom,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
};
