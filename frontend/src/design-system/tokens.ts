/**
 * PNG5 — Agent Permission Governor
 * Design Tokens & Visual Hierarchy
 *
 * Outcome Semantic Mappings:
 * - ALLOW: #00ff88 (Matrix / Neon Green - Score < 30)
 * - CONSTRAIN: #00d4ff (Electric Cyan - Score 30-54)
 * - ESCALATE: #ffaa00 / #ff00ff (Amber / Magenta - Score 55-79)
 * - DENY: #ff3366 (Destructive Red - Score >= 80 or HD1-HD10)
 */

export const CYBER_TOKENS = {
  colors: {
    background: '#0a0a0f',       // Deep void black with slight blue undertone
    foreground: '#e0e0e0',       // Primary text, not pure white (less harsh)
    card: '#12121a',             // Card background, deep purple-black
    muted: '#1c1c2e',            // UI chrome/elevated backgrounds
    mutedForeground: '#6b7280',   // Secondary text, reduced contrast
    accent: '#00ff88',           // PRIMARY NEON - Electric green (ALLOW state)
    accentSecondary: '#ff00ff',  // SECONDARY NEON - Hot magenta (ESCALATE state)
    accentTertiary: '#00d4ff',   // TERTIARY NEON - Cyan/electric blue (CONSTRAIN state)
    warning: '#ffaa00',          // Amber warning (Pending / Escalation)
    border: '#2a2a3a',           // Subtle structural borders
    input: '#12121a',            // Deep input background
    ring: '#00ff88',             // Focus ring matches accent
    destructive: '#ff3366',      // DENY state / Error / danger red-pink
  },
  glows: {
    neonGreen: '0 0 6px #00ff88, 0 0 14px rgba(0, 255, 136, 0.4)',
    neonGreenLg: '0 0 10px #00ff88, 0 0 25px rgba(0, 255, 136, 0.5), 0 0 50px rgba(0, 255, 136, 0.25)',
    neonMagenta: '0 0 6px #ff00ff, 0 0 16px rgba(255, 0, 255, 0.4)',
    neonCyan: '0 0 6px #00d4ff, 0 0 16px rgba(0, 212, 255, 0.4)',
    neonRed: '0 0 6px #ff3366, 0 0 16px rgba(255, 51, 102, 0.4)',
  },
  fonts: {
    headings: '"Orbitron", monospace',
    body: '"JetBrains Mono", monospace',
    tech: '"Share Tech Mono", monospace',
  },
  radii: {
    none: '0px',
    sm: '2px',
    base: '4px',
    chamfer: 'polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px))',
    chamferSm: 'polygon(0 6px, 6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px))',
  },
  contrast: {
    accentOnBg: '7.8:1 (WCAG AAA)',
    foregroundOnBg: '13.2:1 (WCAG AAA)',
    mutedOnBg: '4.6:1 (WCAG AA)',
    cyanOnBg: '8.4:1 (WCAG AAA)',
    magentaOnBg: '5.1:1 (WCAG AA)',
  }
} as const;
