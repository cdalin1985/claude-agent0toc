import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  House,
  Trophy,
  Sword,
  Flame,
  Bell,
  User,
  Gear,
  DoorOpen,
  ArrowRight,
} from '@phosphor-icons/react';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  unreadCount?: number;
}

interface MenuItem {
  path: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.FC<any>;
  badge?: boolean;
}

const menuItems: MenuItem[] = [
  { path: '/', label: 'Home', icon: House },
  { path: '/rankings', label: 'Rankings', icon: Trophy },
  { path: '/challenges', label: 'Challenges', icon: Sword },
  { path: '/matches', label: 'Matches', icon: Flame },
  { path: '/notifications', label: 'Alerts', icon: Bell, badge: true },
  { path: '/profile', label: 'Profile', icon: User },
];

export function SideMenu({ isOpen, onClose, unreadCount = 0 }: SideMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuthStore();

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.nav
            className="fixed left-0 top-0 h-screen border-r z-50 flex flex-col cursor-grab"
            style={{
              width: 'min(256px, 75vw)',
              backgroundColor: 'var(--color-bg-surface)',
              borderColor: 'var(--color-border-default)',
            }}
            initial={{ x: 'min(-256px, -75vw)' }}
            animate={{ x: 0 }}
            exit={{ x: 'min(-256px, -75vw)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            drag="x"
            dragElastic={0.2}
            dragConstraints={{ left: -100, right: 0 }}
            onDragEnd={(event, info) => {
              if (info.velocity.x < -500 || info.offset.x < -50) {
                onClose();
              }
            }}
          >
            {/* Header */}
            <div className="h-16 border-b flex items-center px-6" style={{ borderColor: 'var(--color-border-default)' }}>
              <div className="text-lg font-bold" style={{ color: 'var(--color-accent-primary)' }}>TOC.Monster</div>
            </div>

            {/* Profile Section */}
            {profile && (
              <motion.div
                className="px-4 py-4 border-b cursor-pointer transition-opacity hover:opacity-80"
                onClick={() => handleNavigate('/profile')}
                style={{ borderColor: 'var(--color-border-default)' }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{
                      backgroundColor: 'var(--color-accent-primary)',
                      color: 'white',
                    }}
                  >
                    {(profile.display_name || profile.email)?.[0]?.toUpperCase() || 'U'}
                  </div>
                  {/* Profile Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {profile.display_name || profile.email}
                    </div>
                    <div className="text-xs capitalize truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {profile.role}
                    </div>
                  </div>
                  {/* Arrow */}
                  <ArrowRight size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                </div>
              </motion.div>
            )}

            {/* Navigation Items */}
            <div className="flex-1 overflow-y-auto py-4 px-2">
              {menuItems.map((item, index) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                return (
                  <motion.button
                    key={item.path}
                    onClick={() => handleNavigate(item.path)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg mb-2 transition-colors relative border-l-3 hover:opacity-80"
                    style={{
                      backgroundColor: isActive ? 'rgba(198, 40, 40, 0.1)' : 'transparent',
                      color: isActive ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                      borderLeftColor: isActive ? 'var(--color-accent-primary)' : 'transparent',
                    }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.3 }}
                    whileHover={{ x: 4 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center gap-3 relative">
                      <div className="relative">
                        <Icon size={20} weight="bold" />
                        {item.badge && unreadCount > 0 && (
                          <AnimatePresence>
                            <motion.span
                              key={unreadCount}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              exit={{ scale: 0 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                              className="absolute -top-1.5 -right-2 bg-[#C62828] text-white text-[8px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5"
                            >
                              {unreadCount > 9 ? '9+' : unreadCount}
                            </motion.span>
                          </AnimatePresence>
                        )}
                      </div>
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    {isActive && <ArrowRight size={16} />}
                  </motion.button>
                );
              })}
            </div>

            {/* Settings Section */}
            <div className="border-t px-2 py-4 space-y-2" style={{ borderColor: 'var(--color-border-default)' }}>
              <motion.button
                onClick={() => handleNavigate('/settings')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:opacity-80"
                style={{ color: 'var(--color-text-secondary)' }}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
              >
                <Gear size={20} weight="bold" />
                <span className="text-sm font-medium">Settings</span>
              </motion.button>

              <motion.button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:opacity-80"
                style={{ color: 'var(--color-text-secondary)' }}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
              >
                <DoorOpen size={20} weight="bold" />
                <span className="text-sm font-medium">Sign Out</span>
              </motion.button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  );
}
