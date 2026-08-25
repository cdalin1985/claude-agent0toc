import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

interface InlineQueryErrorProps {
  /** What could not be loaded, in the member's words. */
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}

/**
 * A card-sized "this part did not load" notice.
 *
 * QueryError takes over the whole screen, which is right when there is nothing
 * to show at all. It is wrong for a partial failure: one card failing on a
 * screen where everything else loaded should not blank the screen, but it must
 * not render as an empty card either -- an empty card is a claim, and on this
 * app the claim is usually "you have no challenges waiting", which is exactly
 * the thing a member must not be told by mistake.
 *
 * role="alert" because it appears after load in response to something going
 * wrong, so a screen reader should announce it rather than wait to be asked.
 */
export const InlineQueryError: React.FC<InlineQueryErrorProps> = ({
  message,
  onRetry,
  retrying = false,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    role="alert"
    className="flex items-center gap-3 rounded-2xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3"
  >
    <AlertCircle size={18} className="shrink-0 text-[#EF4444]" aria-hidden="true" />
    <p className="flex-1 font-[Barlow] text-sm leading-snug text-[#E8E2D6]">{message}</p>
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      className="shrink-0 rounded-lg px-3 py-2 font-[Barlow] text-sm font-semibold text-[#EF4444] underline underline-offset-2 disabled:opacity-60"
    >
      {retrying ? 'Retrying…' : 'Retry'}
    </button>
  </motion.div>
);
