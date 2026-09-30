import React from 'react';

export interface CyberInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  prefixSymbol?: string;
  suffixAction?: React.ReactNode;
}

export const CyberInput = React.forwardRef<HTMLInputElement, CyberInputProps>(
  (
    {
      label,
      error,
      helperText,
      prefixSymbol = '>',
      suffixAction,
      className = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5 font-mono">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs uppercase tracking-widest text-[#6b7280] select-none"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {prefixSymbol && (
            <span
              aria-hidden="true"
              className="absolute left-3.5 text-[#00ff88] font-bold text-sm select-none pointer-events-none"
            >
              {prefixSymbol}
            </span>
          )}

          <input
            id={inputId}
            ref={ref}
            disabled={disabled}
            className={`w-full bg-[#12121a] text-[#00ff88] border ${
              error ? 'border-[#ff3366] text-[#ff3366]' : 'border-[#2a2a3a]'
            } cyber-chamfer-sm py-2.5 ${
              prefixSymbol ? 'pl-8' : 'pl-3.5'
            } pr-3.5 text-sm placeholder:text-[#6b7280] tracking-wide transition-all duration-200 outline-none focus:border-[#00ff88] focus:shadow-[0_0_12px_rgba(0,255,136,0.35)] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
            {...props}
          />

          {suffixAction && (
            <div className="absolute right-2 flex items-center">{suffixAction}</div>
          )}
        </div>

        {error ? (
          <p className="text-xs text-[#ff3366] tracking-wider mt-1">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-[#6b7280] tracking-wider mt-1">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

CyberInput.displayName = 'CyberInput';
