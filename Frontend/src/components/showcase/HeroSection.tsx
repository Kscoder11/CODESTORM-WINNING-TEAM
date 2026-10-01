import React from 'react';
import { CyberButton } from '../cyber/CyberButton';
import { CyberGlitchText } from '../cyber/CyberGlitchText';
import { CyberMetadata } from '../cyber/CyberMetadata';
import { CyberHUD } from '../cyber/CyberHUD';
import { ArrowRight, ShieldCheck, Terminal, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface HeroSectionProps {
  onExploreApprovals: () => void;
  onOpenTerminal: () => void;
  scanlinesActive: boolean;
  onToggleScanlines: () => void;
  glitchActive: boolean;
  onToggleGlitch: () => void;
  neonIntensity: 'low' | 'medium' | 'high';
  onIntensityChange: (intensity: 'low' | 'medium' | 'high') => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onExploreApprovals,
  onOpenTerminal,
  scanlinesActive,
  onToggleScanlines,
  glitchActive,
  onToggleGlitch,
  neonIntensity,
  onIntensityChange,
}) => {
  return (
    <section className="relative pt-12 pb-20 md:py-24 border-b border-[#2a2a3a] overflow-hidden">
      {/* Background ambient neon radial gradients */}
      <div
        aria-hidden="true"
        className="absolute top-10 left-1/4 w-96 h-96 bg-[#00ff88]/5 rounded-full blur-3xl pointer-events-none -z-10"
      />
      <div
        aria-hidden="true"
        className="absolute top-40 right-10 w-96 h-96 bg-[#00d4ff]/5 rounded-full blur-3xl pointer-events-none -z-10"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Asymmetrical 60/40 Hero Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* 60% Left Editorial & Action Column */}
          <div className="lg:col-span-7 space-y-6">
            {/* Metadata (Zero-Pill Discipline) */}
            <CyberMetadata
              items={[
                { label: 'SYSTEM', value: 'NOMOS AGENT GOVERNOR' },
                { label: 'CORE MOTTO', value: 'AGENT NEVER EXECUTES DIRECTLY', highlight: true },
                { label: 'BOUNDARY', value: 'ZERO-TRUST GATEWAY' },
              ]}
              separator="·"
            />

            {/* Glitched Headline with Chromatic Aberration */}
            <div className="space-y-2">
              <CyberGlitchText
                as="h1"
                text="RUNTIME SECURITY / AGENT GOVERNOR"
                glitchActive={glitchActive}
                className="text-3xl sm:text-5xl lg:text-6xl font-black text-[#e0e0e0] leading-tight"
              >
                RUNTIME SECURITY <span className="text-[#00ff88]">AGENT GOVERNOR</span>
              </CyberGlitchText>
              <div className="text-sm sm:text-lg font-tech text-[#00d4ff] uppercase tracking-widest flex items-center gap-2">
                <span>INTERCEPT · CANONICALIZE · EVALUATE · ENFORCE</span>
                <span className="cyber-cursor" />
              </div>
            </div>

            {/* Subtitle Prose */}
            <p className="text-sm sm:text-base text-[#a0a0b0] font-mono leading-relaxed max-w-2xl">
              An authoritative runtime authorization and enforcement layer positioned between autonomous
              AI agents and execution environments. Intercepts all actions, enforces non-overridable hard-deny
              rules (HD1–HD10), tracks session-bound taint lineage, and routes high-risk operations through
              request-hash-bound human approval.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <CyberButton
                variant="glitch"
                size="lg"
                onClick={onExploreApprovals}
                icon={<ArrowRight className="w-4 h-4" />}
                iconPosition="right"
              >
                Inspect Approval Queue
              </CyberButton>
              <CyberButton
                variant="outline"
                size="lg"
                onClick={onOpenTerminal}
                icon={<Terminal className="w-4 h-4 text-[#00d4ff]" />}
              >
                Governor SOC CLI
              </CyberButton>
            </div>

            {/* Proof Metrics (Claim-to-Proof Adjacency) */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-[#2a2a3a]">
              <div>
                <span className="block text-2xl font-black text-[#00ff88] font-heading tabular-nums">
                  3.2ms
                </span>
                <span className="text-[11px] font-mono text-[#6b7280] uppercase tracking-wider">
                  p50 Decision Latency
                </span>
              </div>
              <div>
                <span className="block text-2xl font-black text-[#00d4ff] font-heading tabular-nums">
                  HD1–HD10
                </span>
                <span className="text-[11px] font-mono text-[#6b7280] uppercase tracking-wider">
                  Hard-Deny Rules
                </span>
              </div>
              <div>
                <span className="block text-2xl font-black text-[#ffaa00] font-heading tabular-nums">
                  SHA-256
                </span>
                <span className="text-[11px] font-mono text-[#6b7280] uppercase tracking-wider">
                  Chained Audit Trail
                </span>
              </div>
            </div>
          </div>

          {/* 40% Right Interactive HUD Panel */}
          <div className="lg:col-span-5">
            <CyberHUD
              scanlinesActive={scanlinesActive}
              onToggleScanlines={onToggleScanlines}
              glitchActive={glitchActive}
              onToggleGlitch={onToggleGlitch}
              neonIntensity={neonIntensity}
              onIntensityChange={onIntensityChange}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
