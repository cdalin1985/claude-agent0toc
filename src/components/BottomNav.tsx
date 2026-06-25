import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { House, Medal, List, Trophy, Bell, UserCircle } from '@phosphor-icons/react';

type PhosphorWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

interface NavItem {
  label: string;
  path: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: React.FC<any>;
  menu?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home',      path: '/',             Icon: House },
  { label: 'Rankings',  path: '/rankings',      Icon: Medal },
  { label: 'Menu',      path: '#',             Icon: List, menu: true },
  { label: 'Matches',   path: '/matches',       Icon: Trophy },
  { label: 'Alerts',    path: '/notifications', Icon: Bell },
  { label: 'Profile',   path: '/settings',      Icon: UserCircle },
];

export const BottomNav: React.FC<{ unreadCount: number; onMenuToggle: () => void }> = ({
  unreadCount,
  onMenuToggle,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string, isMenu?: boolean) => {
    if (isMenu) return false;
    return location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-end justify-around px-2"
      style={{
        background: 'rgba(10,8,8,0.94)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
        paddingTop: '8px',
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.path, item.menu);
        const { Icon } = item;
        const weight: PhosphorWeight = active ? 'fill' : 'regular';

        if (item.menu) {
          return (
            <motion.button
              key={item.label}
              onClick={onMenuToggle}
              whileTap={{ scale: 0.88 }}
              className="flex flex-col items-center gap-0.5 px-3 py-1 min-w-[44px] relative"
              aria-label="Menu"
            >
              <div className="relative">
                <Icon
                  size={22}
                  weight="bold"
                  style={{ color: '#666' }}
                />
              </div>
              <span
                className="font-[Bebas_Neue] tracking-widest uppercase leading-none"
                style={{ fontSize: '10px', color: '#666' }}
              >
                {item.label}
              </span>
            </motion.button>
          );
        }

        return (
          <motion.button
            key={item.label}
            onClick={() => navigate(item.path)}
            whileTap={{ scale: 0.88 }}
            className="flex flex-col items-center gap-0.5 px-3 py-1 min-w-[44px] relative"
            aria-label={item.label}
          >
            {/* Active background pill */}
            {active && (
              <motion.div
                layoutId="nav-active-bg"
                className="absolute inset-0 rounded-xl"
                style={{ background: 'rgba(198,40,40,0.1)' }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}

            <div className="relative">
              <motion.div
                animate={active ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <Icon
                  size={22}
                  weight={weight}
                  style={{ color: active ? '#EF5350' : '#555' }}
                />
              </motion.div>

              {/* Notification badge */}
              {item.label === 'Alerts' && unreadCount > 0 && (
                <AnimatePresence>
                  <motion.span
                    key={unreadCount}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                    className="absolute -top-1.5 -right-2 bg-[#C62828] text-white text-[8px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5 font-[Azeret_Mono]"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </motion.span>
                </AnimatePresence>
              )}
            </div>

            <span
              className="font-[Bebas_Neue] tracking-widest uppercase leading-none"
              style={{ fontSize: '10px', color: active ? '#EF5350' : '#555' }}
            >
              {item.label}
            </span>

            {/* Active dot */}
            {active && (
              <motion.div
                layoutId="nav-dot"
                className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-[#C62828]"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
          </motion.button>
        );
      })}
    </nav>
  );
};
