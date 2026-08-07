import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { COACH_COPY, type CoachTipId } from '../data/coachCopy';

type CoachTipProps = {
  id: CoachTipId;
  size?: number;
  className?: string;
};

export function CoachTip({ id, size = 16, className = '' }: CoachTipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const copy = COACH_COPY[id];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!copy) return null;

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
        aria-label={copy.title}
      >
        <HelpCircle size={size} />
      </button>
      {open && (
        <div className="absolute z-50 top-full right-0 mt-2 w-56 p-3 rounded-xl bg-[#1A1A1A] border border-[#333] shadow-xl">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="font-[Barlow] font-semibold text-xs text-[#E8E2D6]">{copy.title}</div>
            <button onClick={() => setOpen(false)} className="text-[#6B7280] -mt-0.5 -mr-0.5 shrink-0"><X size={12} /></button>
          </div>
          <p className="text-[11px] font-[Barlow] text-[#9CA3AF] leading-snug">{copy.body}</p>
        </div>
      )}
    </div>
  );
}