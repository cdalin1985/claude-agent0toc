import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

function format(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export function CooldownTicker({ expiresAt, playerId }: { expiresAt: string; playerId: string | null | undefined }) {
  const queryClient = useQueryClient();
  const [remainingMs, setRemainingMs] = useState(() => new Date(expiresAt).getTime() - Date.now());

  useEffect(() => {
    const tick = () => setRemainingMs(new Date(expiresAt).getTime() - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (remainingMs > 0) return;
    queryClient.invalidateQueries({ queryKey: ['cooldown', playerId] });
  }, [remainingMs, queryClient, playerId]);

  if (remainingMs <= 0) return null;

  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F59E0B]/15 border border-[#F59E0B]/30">
      <Clock size={12} className="text-[#F59E0B]" />
      <span className="font-[Azeret_Mono] text-xs text-[#F59E0B] tabular-nums">
        Cooldown {format(remainingMs)}
      </span>
    </div>
  );
}
