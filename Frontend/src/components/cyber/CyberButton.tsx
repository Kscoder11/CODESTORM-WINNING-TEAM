import React from 'react';

export type CyberButtonVariant = 'default' | 'secondary' | 'cyan' | 'outline' | 'ghost' | 'glitch';
export type CyberButtonSize = 'sm' | 'md' | 'lg';

export interface CyberButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: CyberButtonVariant;
  size?: CyberButtonSize;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  glitchText?: string;
  loading?: boolean;
  loadingText?: string;
}

export const CyberButton: React.FC<CyberButtonProps> = ({
  children,
  variant = 'default',
  size = 'md',
  icon,
  iconPosition = 'left',
  glitchText,
  className = '',
  disabled,
  loading = false,
  loadingText,
  ...props
}) => {
  const sizeClasses: Record<CyberButtonSize, string> = {
    sm: 'text-xs px-3.5 py-1.5 min-h-[36px] gap-1.5 tracking-wider',
    md: 'text-sm px-5 py-2.5 min-h-[42px] gap-2 tracking-widest',
    lg: 'text-base px-7 py-3.5 min-h-[48px] gap-2.5 tracking-widest',
  };

  const baseClasses =
    'relative inline-flex items-center justify-center font-mono uppercase font-bold transition-all duration-150 active:scale-[0.98] select-none cursor-pointer disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff88] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0f] cyber-chamfer-sm';

  const variantClasses: Record<CyberButtonVariant, string> = {
    default:
      'bg-transparent border-2 border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-[#0a0a0f] hover:shadow-[0_0_12px_#00ff88,0_0_24px_rgba(0,255,136,0.4)]',
    secondary:
      'bg-transparent border-2 border-[#ff00ff] text-[#ff00ff] hover:bg-[#ff00ff] hover:text-[#0a0a0f] hover:shadow-[0_0_12px_#ff00ff,0_0_24px_rgba(255,0,255,0.4)]',
    cyan:
      'bg-transparent border-2 border-[#00d4ff] text-[#00d4ff] hover:bg-[#00d4ff] hover:text-[#0a0a0f] hover:shadow-[0_0_12px_#00d4ff,0_0_24px_rgba(0,212,255,0.4)]',
    outline:
      'bg-transparent border border-[#2a2a3a] text-[#e0e0e0] hover:border-[#00ff88] hover:text-[#00ff88] hover:shadow-[0_0_10px_rgba(0,255,136,0.3)]',
    ghost:
      'bg-transparent border border-transparent text-[#6b7280] hover:bg-[#00ff88]/10 hover:text-[#00ff88]',
    glitch:
      'bg-[#00ff88] text-[#0a0a0f] font-black border-2 border-[#00ff88] hover:brightness-110 shadow-[0_0_15px_rgba(0,255,136,0.6)]',
  };

  const displayText = typeof children === 'string' ? children : glitchText || '';
  const isLoading = loading || disabled;

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={isLoading}
      {...props}
    >
      {/* Decorative corner cut accent */}
      <span
        aria-hidden="true"
        className="absolute top-0 right-0 w-1.5 h-1.5 bg-current opacity-60 pointer-events-none"
      />

      {icon && iconPosition === 'left' && !loading && <span className="shrink-0">{icon}</span>}

      {loading && (
        <span className="flex items-center justify-center shrink-0">
          <svg
            className="animate-spin w-4 h-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </span>
      )}

      {variant === 'glitch' && displayText && !loading ? (
        <span className="cyber-glitch" data-text={displayText}>
          {children}
        </span>
      ) : (
        <span>{loading && loadingText ? loadingText : children}</span>
      )}

      {icon && iconPosition === 'right' && !loading && <span className="shrink-0">{icon}</span>}
    </button>
  );
};
