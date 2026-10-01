import React from 'react';

export type CyberCardVariant = 'default' | 'terminal' | 'holographic';

export interface CyberCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CyberCardVariant;
  title?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  headerRight?: React.ReactNode;
  hoverEffect?: boolean;
}

export const CyberCard: React.FC<CyberCardProps> = ({
  children,
  variant = 'default',
  title,
  subtitle,
  badge,
  headerRight,
  hoverEffect = true,
  className = '',
  ...props
}) => {
  const hoverStyles = hoverEffect
    ? 'hover:-translate-y-0.5 hover:border-[#00ff88] hover:shadow-[0_0_15px_rgba(0,255,136,0.25)] transition-all duration-200'
    : '';

  if (variant === 'terminal') {
    return (
      <div
        className={`relative bg-[#0a0a0f] border border-[#2a2a3a] cyber-chamfer ${hoverStyles} ${className}`}
        {...props}
      >
        {/* Terminal Header Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#12121a] border-b border-[#2a2a3a]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff3366] inline-block opacity-80" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffaa00] inline-block opacity-80" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#00ff88] inline-block opacity-80" />
            <span className="ml-2 text-xs font-mono text-[#6b7280] tracking-wider select-none truncate">
              {title || 'TERMINAL_SESSION.sh'}
            </span>
          </div>
          {headerRight && <div className="text-xs">{headerRight}</div>}
        </div>

        {/* Content Body */}
        <div className="p-5">{children}</div>
      </div>
    );
  }

  if (variant === 'holographic') {
    return (
      <div
        className={`relative bg-[#1c1c2e]/35 backdrop-blur-md border border-[#00d4ff]/40 cyber-chamfer shadow-[0_0_20px_rgba(0,212,255,0.15)] ${hoverStyles} ${className}`}
        {...props}
      >
        {/* Holographic HUD corner brackets */}
        <span
          aria-hidden="true"
          className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#00d4ff] pointer-events-none"
        />
        <span
          aria-hidden="true"
          className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#00d4ff] pointer-events-none"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#00d4ff] pointer-events-none"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#00d4ff] pointer-events-none"
        />

        {/* Optional Header */}
        {(title || headerRight) && (
          <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-[#00d4ff]/20">
            <div>
              {title && (
                <h3 className="text-sm font-bold uppercase tracking-widest text-[#00d4ff]">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-[#6b7280] tracking-wider mt-0.5">{subtitle}</p>
              )}
            </div>
            {headerRight}
          </div>
        )}

        <div className="p-5">{children}</div>
      </div>
    );
  }

  // Default Variant
  return (
    <div
      className={`relative bg-[#12121a] border border-[#2a2a3a] cyber-chamfer ${hoverStyles} ${className}`}
      {...props}
    >
      {(title || badge || headerRight) && (
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            {title && (
              <h3 className="text-base font-bold uppercase tracking-wider text-[#e0e0e0] font-heading">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-[#6b7280] tracking-wider mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {badge}
            {headerRight}
          </div>
        </div>
      )}

      <div className={title ? 'px-5 pb-5' : 'p-5'}>{children}</div>
    </div>
  );
};
