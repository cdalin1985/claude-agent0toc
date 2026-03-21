import React from 'react';
import { motion } from 'framer-motion';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const VARIANT_STYLES: Record<Variant, string> = {
  primary:   'bg-[#C62828] hover:bg-[#EF5350] text-[#E8E2D6] shadow-lg hover:shadow-[0_0_20px_rgba(198,40,40,0.4)]',
  secondary: 'bg-[#252525] hover:bg-[#333] text-[#E8E2D6] border border-[#333]',
  danger:    'bg-[#EF4444]/20 hover:bg-[#EF4444]/30 text-[#EF4444] border border-[#EF4444]/30',
  ghost:     'bg-transparent hover:bg-white/5 text-[#9CA3AF] border border-[#333]',
  success:   'bg-[#22C55E]/20 hover:bg-[#22C55E]/30 text-[#22C55E] border border-[#22C55E]/30',
};

const SIZE_STYLES = {
  sm: 'px-3 py-2 text-sm min-h-[36px]',
  md: 'px-5 py-3 text-base min-h-[48px]',
  lg: 'px-6 py-4 text-lg min-h-[56px]',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  loading = false,
  fullWidth = false,
  size = 'md',
  disabled,
  className = '',
  ...rest
}) => {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      whileHover={isDisabled ? undefined : { y: -1 }}
      className={[
        'rounded-[8px] font-semibold font-[Outfit] tracking-wide transition-all duration-200',
        'flex items-center justify-center gap-2 select-none',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        fullWidth ? 'w-full' : '',
        isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        className,
      ].join(' ')}
      disabled={isDisabled}
      {...(rest as object)}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Loading…
        </span>
      ) : children}
    </motion.button>
  );
};
