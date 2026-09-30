import React from 'react';

export interface CyberGlitchTextProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'span' | 'p';
  text: string;
  glow?: boolean;
  glowColor?: 'green' | 'magenta' | 'cyan';
  glitchActive?: boolean;
}

export const CyberGlitchText: React.FC<CyberGlitchTextProps> = ({
  as: Component = 'h1',
  text,
  glow = true,
  glowColor = 'green',
  glitchActive = true,
  className = '',
  children,
  ...props
}) => {
  const glowStyles = glow
    ? glowColor === 'green'
      ? 'neon-text-glow'
      : glowColor === 'magenta'
      ? 'neon-text-magenta'
      : 'neon-text-cyan'
    : '';

  return (
    <Component
      className={`font-heading uppercase tracking-wider ${
        glitchActive ? 'cyber-glitch' : ''
      } ${glowStyles} ${className}`}
      data-text={text}
      style={{ textWrap: 'balance' }}
      {...props}
    >
      {children || text}
    </Component>
  );
};
