import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Cooldown } from '../types/database';

export type ActiveCooldown = {
  type: Cooldown['type'];
  expiresAt: string;
};

export function useCooldown(playerId: string | undefined | null) {
  return useQuery<ActiveCooldown | null>({
    queryKey: ['cooldown', playerId],
    queryFn: async () => {
      if (!playerId) return null;
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from('cooldowns')
        .select('type, expires_at')
        .eq('player_id', playerId)
        .gt('expires_at', nowIso)
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      return { type: data.type, expiresAt: data.expires_at };
    },
    enabled: !!playerId,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}
