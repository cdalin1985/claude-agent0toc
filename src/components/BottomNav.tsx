import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, List, Swords, Trophy, Bell, User } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

interface NavItem {
  label: string;
  path: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.FC<any>;
  center?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home',     path: '/',            icon: Home },
  { label: 'Rankings', path: '/rankings',     icon: List },
  { label: 'Challenge',path: '/rankings',     icon: Swords, center: true },
  { label: 'Matches',  path: '/matches',      icon: Trophy },
  { label: 'Alerts',   path: '/notifications',icon: Bell },
  { label: 'Settings', path: '/settings',     icon: User },
];

export const BottomNav: React.FC<{ unreadCount: number }> = ({ unreadCount }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { player } = useAuthStore();

  const isActive = (path: string, center?: boolean) => {
    if (center) return false; // center button never shows as "active"
    return location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-end justify-around px-2 pb-safe"
      style={{
        background: 'rgba(13,13,13,0.85)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
        paddingTop: '8px',
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.path, item.center);
        const Icon = item.icon;

        if (item.center) {
          // The elevated center "Challenge" button
          return (
            <motion.button
              key={item.label}
              onClick={() => navigate(player ? '/rankings?challenge=1' : '/login')}
              whileTap={{ scale: 0.92 }}
              className="flex flex-col items-center -mt-4 relative"
              aria-label="Challenge"
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center relative"
                style={{
                  background: 'linear-gradient(135deg, #EF5350, #C62828)',
                  boxShadow: '0 4px 20px rgba(198,40,40,0.5)',
                  animation: !player ? 'pulse-glow 2.5s ease-in-out infinite' : undefined,
                }}
              >
                <Icon size={24} strokeWidth={2.5} />
              </div>
              <span className="text-[10px] text-[#9CA3AF] mt-1 font-[Outfit]">{item.label}</span>
            </motion.button>
          );
        }

        return (
          <motion.button
            key={item.label}
            onClick={() => navigate(item.path)}
            whileTap={{ scale: 0.9 }}
            className="flex flex-col items-center gap-0.5 px-3 py-1 min-w-[44px] relative"
            aria-label={item.label}
          >
            {/* Active spotlight glow */}
            {active && (
              <motion.div
                layoutId="nav-glow"
                className="absolute inset-0 rounded-xl"
                style={{ background: 'rgba(198,40,40,0.08)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}

            <div className="relative">
              <Icon
                size={22}
                strokeWidth={active ? 2.5 : 1.8}
                style={{ color: active ? '#C62828' : '#6B7280' }}
              />
              {/* Notification badge on bell */}
              {item.label === 'Alerts' && unreadCount > 0 && (
                <AnimatePresence>
                  <motion.span
                    key={unreadCount}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                    className="absolute -top-1.5 -right-1.5 bg-[#C62828] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center font-[JetBrains_Mono]"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </motion.span>
                </AnimatePresence>
              )}
            </div>

            <span
              className="text-[10px] font-[Outfit] font-medium"
              style={{ color: active ? '#C62828' : '#6B7280' }}
            >
              {item.label}
            </span>

            {/* Active crimson dot */}
            {active && (
              <motion.div
                layoutId="nav-dot"
                className="absolute -bottom-1 w-1 h-1 rounded-full bg-[#C62828]"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
          </motion.button>
        );
      })}
    </nav>
  );
};
