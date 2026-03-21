import React from 'react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
  action?: React.ReactNode;
}

// SVG pool table illustration for the "no matches" empty state
const PoolTableSVG: React.FC = () => (
  <svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Table felt */}
    <rect x="8" y="8" width="104" height="64" rx="6" fill="#006341" opacity="0.7"/>
    {/* Rail */}
    <rect x="2" y="2" width="116" height="76" rx="8" fill="none" stroke="#4A2C0A" strokeWidth="5" opacity="0.8"/>
    {/* Pockets */}
    {[[8,8],[60,8],[112,8],[8,72],[60,72],[112,72]].map(([cx,cy],i) => (
      <circle key={i} cx={cx} cy={cy} r="5" fill="#0D0D0D" opacity="0.9"/>
    ))}
    {/* Cue ball */}
    <circle cx="80" cy="40" r="6" fill="white" opacity="0.9"/>
    <circle cx="78" cy="38" r="2" fill="rgba(255,255,255,0.6)"/>
    {/* 8 ball */}
    <circle cx="40" cy="40" r="6" fill="#1A1A1A"/>
    <circle cx="40" cy="40" r="3" fill="white" opacity="0.9"/>
    <text x="40" y="43" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#1A1A1A">8</text>
    {/* Cue stick */}
    <line x1="90" y1="30" x2="110" y2="15" stroke="#8B5E3C" strokeWidth="2.5" strokeLinecap="round" opacity="0.7"/>
    <line x1="89" y1="31" x2="91" y2="29" stroke="#E8E2D6" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
  </svg>
);

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, message, action }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-16 px-6 text-center"
  >
    {icon ? (
      <span className="text-5xl mb-4">{icon}</span>
    ) : (
      <div className="mb-6 opacity-60">
        <PoolTableSVG />
      </div>
    )}
    <h3 className="font-[Bebas_Neue] text-2xl text-[#E8E2D6] mb-2">{title}</h3>
    <p className="text-[#9CA3AF] text-sm max-w-[240px] leading-relaxed">{message}</p>
    {action && <div className="mt-6">{action}</div>}
  </motion.div>
);
