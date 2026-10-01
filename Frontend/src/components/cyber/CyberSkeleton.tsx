import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width = '100%',
  height,
  animation = 'pulse',
  className = '',
  style,
  ...props
}) => {
  const baseStyles: React.CSSProperties = {
    background: 'linear-gradient(90deg, #1c1c2e 25%, #2a2a3a 50%, #1c1c2e 75%)',
    backgroundSize: '200% 100%',
    borderRadius: variant === 'circular' ? '9999px' : variant === 'rectangular' ? '4px' : '4px',
    width,
    height: height || (variant === 'text' ? '1rem' : variant === 'circular' ? '1rem' : '1rem'),
  };

  const animationStyles: Record<string, React.CSSProperties> = {
    pulse: {
      animation: 'skeleton-pulse 1.5s ease-in-out infinite',
    },
    wave: {
      animation: 'skeleton-wave 1.5s ease-in-out infinite',
    },
    none: {},
  };

  return (
    <div
      className={`skeleton ${className}`}
      style={{ ...baseStyles, ...animationStyles[animation], ...style }}
      {...props}
    />
  );
};

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-[#12121a] border border-[#2a2a3a] cyber-chamfer p-5 space-y-4 ${className}`}>
    <div className="flex items-center justify-between">
      <Skeleton variant="text" width="40%" height="1.25rem" />
      <Skeleton variant="circular" width="2rem" height="2rem" />
    </div>
    <Skeleton variant="text" width="60%" height="1rem" />
    <Skeleton variant="text" width="80%" height="0.875rem" />
    <div className="grid grid-cols-5 gap-2 pt-2">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} variant="rectangular" height="3rem" />
      ))}
    </div>
  </div>
);

export const SkeletonTableRow: React.FC<{ columns?: number; className?: string }> = ({
  columns = 6,
  className = '',
}) => (
  <tr className={className}>
    {[...Array(columns)].map((_, i) => (
      <td key={i} className="py-3 px-4">
        <Skeleton variant="text" width={i === 0 ? '2rem' : '80%'} height="0.75rem" />
      </td>
    ))}
  </tr>
);

export const SkeletonTable: React.FC<{ rows?: number; columns?: number; className?: string }> = ({
  rows = 5,
  columns = 6,
  className = '',
}) => (
  <div className={`bg-[#12121a] border border-[#2a2a3a] cyber-chamfer overflow-x-auto ${className}`}>
    <table className="w-full text-left font-mono text-xs">
      <thead>
        <tr className="border-b border-[#2a2a3a] bg-[#0a0a0f] text-[#6b7280] uppercase text-[10px] tracking-wider">
          {[...Array(columns)].map((_, i) => (
            <th key={i} className="py-3 px-4">
              <Skeleton variant="text" width="60%" height="0.625rem" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[#2a2a3a]">
        {[...Array(rows)].map((_, rowIndex) => (
          <SkeletonTableRow key={rowIndex} columns={columns} />
        ))}
      </tbody>
    </table>
  </div>
);

export const SkeletonApprovalItem: React.FC = () => (
  <div className="p-4 bg-[#12121a] border border-[#2a2a3a] cyber-chamfer">
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-mono text-[#6b7280]">
          <Skeleton variant="text" width="5rem" height="0.75rem" />
          <span aria-hidden="true">·</span>
          <Skeleton variant="text" width="8rem" height="0.75rem" />
          <span aria-hidden="true">·</span>
          <Skeleton variant="text" width="6rem" height="0.75rem" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton variant="rectangular" width="5rem" height="1.25rem" />
          <Skeleton variant="text" width="10rem" height="0.75rem" />
        </div>
        <Skeleton variant="text" width="16rem" height="0.7rem" />
      </div>
      <div className="text-right shrink-0">
        <Skeleton variant="rectangular" width="5rem" height="1.25rem" />
        <Skeleton variant="text" width="5rem" height="0.625rem" className="mt-1" />
      </div>
    </div>
  </div>
);

export const SkeletonStatCard: React.FC = () => (
  <div className="p-4 bg-[#12121a] border border-[#2a2a3a] cyber-chamfer-sm space-y-2">
    <Skeleton variant="text" width="30%" height="0.625rem" />
    <Skeleton variant="text" width="40%" height="2rem" className="text-3xl" />
    <Skeleton variant="text" width="60%" height="0.625rem" />
  </div>
);