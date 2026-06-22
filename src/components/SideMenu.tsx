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
}

const menuItems = [
  { path: '/', label: 'Home', icon: House },
  { path: '/rankings', label: 'Rankings', icon: Trophy },
  { path: '/challenges', label: 'Challenges', icon: Sword },
  { path: '/matches', label: 'Matches', icon: Flame },
  { path: '/notifications', label: 'Alerts', icon: Bell },
  { path: '/profile', label: 'Profile', icon: User },
];

export function SideMenu({ isOpen, onClose }: SideMenuProps) {
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
            className="fixed left-0 top-0 h-screen w-64 bg-slate-900 border-r border-slate-800 z-50 flex flex-col"
            initial={{ x: -256 }}
            animate={{ x: 0 }}
            exit={{ x: -256 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* Header */}
            <div className="h-16 border-b border-slate-800 flex items-center px-6">
              <div className="text-lg font-bold text-red-500">TOC.Monster</div>
            </div>

            {/* Profile Section */}
            {profile && (
              <div className="px-4 py-4 border-b border-slate-800">
                <div className="text-sm font-semibold text-slate-200">
                  {profile.display_name || profile.email}
                </div>
                <div className="text-xs text-slate-400 mt-1 capitalize">
                  {profile.role}
                </div>
              </div>
            )}

            {/* Navigation Items */}
            <div className="flex-1 overflow-y-auto py-4 px-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                return (
                  <motion.button
                    key={item.path}
                    onClick={() => handleNavigate(item.path)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg mb-2 transition-colors ${
                      isActive
                        ? 'bg-red-500/10 text-red-500'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                    whileHover={{ x: 4 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={20} weight="bold" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    {isActive && <ArrowRight size={16} />}
                  </motion.button>
                );
              })}
            </div>

            {/* Settings Section */}
            <div className="border-t border-slate-800 px-2 py-4 space-y-2">
              <motion.button
                onClick={() => handleNavigate('/settings')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
              >
                <Gear size={20} weight="bold" />
                <span className="text-sm font-medium">Settings</span>
              </motion.button>

              <motion.button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-red-500/10 hover:text-red-500 transition-colors"
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
