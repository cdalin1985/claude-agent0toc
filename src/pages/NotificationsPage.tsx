import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { GlassCard } from '../components/GlassCard';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { RankingRowSkeleton } from '../components/Skeleton';
import { formatDistanceToNow } from '../utils/time';
import type { Notification } from '../types/database';

const TYPE_ICONS: Record<string, string> = {
  challenge_received: '⚔️',
  challenge_accepted: '✅',
  challenge_declined: '❌',
  challenge_expired:  '⏰',
  match_scheduled:    '📅',
  match_reminder:     '🎱',
  result_submitted:   '📊',
  result_confirmed:   '🏆',
  result_disputed:    '⚠️',
  rank_changed:       '📈',
};

export default function NotificationsPage() {
  const { player } = useAuthStore();
  const navigate   = useNavigate();
  const qc         = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications', player?.id],
    queryFn: async () => {
      if (!player) return [];
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('player_id', player.id)
        .order('created_at', { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: !!player,
  });

  const markRead = async (n: Notification) => {
    if (n.is_read) return;
    await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
    qc.invalidateQueries({ queryKey: ['notifications'] });
    // Navigate to related content
    if (n.reference_type === 'challenge') navigate(`/challenges`);
    else if (n.reference_type === 'match') navigate(`/match/${n.reference_id}`);
  };

  const markAllRead = async () => {
    if (!player) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('player_id', player.id)
      .eq('is_read', false);
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen px-4 pt-8 pb-4">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Bell size={24} className="text-[#C62828]" />
          <h1 className="font-[Bebas_Neue] text-5xl tracking-wide text-[#E8E2D6]">Alerts</h1>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="bg-[#C62828] text-white text-xs font-bold rounded-full px-2 py-0.5 font-[JetBrains_Mono]"
            >
              {unread}
            </motion.span>
          )}
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1 text-[#C62828] text-sm font-[Outfit]"
          >
            <CheckCheck size={16} /> Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <RankingRowSkeleton key={i} />)}</div>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="No Notifications"
          message="You're all caught up! Notifications from challenges and matches will appear here."
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <GlassCard
                hover
                onClick={() => markRead(n)}
                className={`p-4 flex items-start gap-3 ${!n.is_read ? 'border-[#C62828]/20' : ''}`}
              >
                <span className="text-2xl shrink-0">{TYPE_ICONS[n.type] ?? '🎱'}</span>
                <div className="flex-1 min-w-0">
                  <div className={`font-[Outfit] font-semibold text-sm ${n.is_read ? 'text-[#9CA3AF]' : 'text-[#E8E2D6]'}`}>
                    {n.title}
                  </div>
                  <div className="text-[#9CA3AF] text-xs font-[Outfit] mt-0.5 leading-relaxed">{n.body}</div>
                  <div className="text-[#6B7280] text-xs font-[Outfit] mt-1">
                    {formatDistanceToNow(n.created_at)}
                  </div>
                </div>
                {!n.is_read && (
                  <div className="w-2 h-2 rounded-full bg-[#C62828] shrink-0 mt-1" />
                )}
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
