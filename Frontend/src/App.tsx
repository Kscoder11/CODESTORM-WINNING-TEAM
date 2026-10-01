/**
 * PNG5 — Agent Permission Governor
 * Security Operations Dashboard & Human-In-The-Loop Console
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { TopBar } from './components/showcase/TopBar';
import { HeroSection } from './components/showcase/HeroSection';
import { WorkspaceStudioSection } from './components/studio/WorkspaceStudioSection';
import { PlaygroundSection } from './components/showcase/PlaygroundSection';
import { CyberTerminal } from './components/cyber/CyberTerminal';
import { SprawlConsoleSection } from './components/showcase/SprawlConsoleSection';
import { ArchitectureSection } from './components/showcase/ArchitectureSection';
import { CyberMetadata } from './components/cyber/CyberMetadata';
import { CyberButton } from './components/cyber/CyberButton';
import { X, Terminal as TerminalIcon, AlertTriangle, ShieldCheck } from 'lucide-react';
import { governorApi } from './lib/api';

export default function App() {
  const [activeSection, setActiveSection] = useState('hero');
  const [scanlinesActive, setScanlinesActive] = useState(true);
  const [glitchActive, setGlitchActive] = useState(true);
  const [neonIntensity, setNeonIntensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [terminalDrawerOpen, setTerminalDrawerOpen] = useState(false);
  const [killModalOpen, setKillModalOpen] = useState(false);
  const [killSuccessNotice, setKillSuccessNotice] = useState<string | null>(null);
  const [killLoading, setKillLoading] = useState(false);

  // Ensure page starts at top on initial load
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Apply intensity classes to root if needed
  useEffect(() => {
    const root = document.documentElement;
    if (neonIntensity === 'low') {
      root.style.setProperty('--box-shadow-neon', '0 0 3px #00ff88, 0 0 6px rgba(0, 255, 136, 0.2)');
    } else if (neonIntensity === 'high') {
      root.style.setProperty('--box-shadow-neon', '0 0 10px #00ff88, 0 0 30px rgba(0, 255, 136, 0.6), 0 0 60px rgba(0, 255, 136, 0.3)');
    } else {
      root.style.setProperty('--box-shadow-neon', '0 0 6px #00ff88, 0 0 14px rgba(0, 255, 136, 0.4)');
    }
  }, [neonIntensity]);

  const handleNavigate = (sectionId: string) => {
    setActiveSection(sectionId);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleConfirmKill = async (sessionId: string) => {
    setKillLoading(true);
    const res = await governorApi.suspendSession(sessionId);
    setKillSuccessNotice(res.message);
    setKillModalOpen(false);
    setKillLoading(false);
    setTimeout(() => setKillSuccessNotice(null), 5000);
  };

  return (
    <div className="relative min-h-screen bg-[#0a0a0f] text-[#e0e0e0] font-mono cyber-grid selection:bg-[#00ff88]/30 selection:text-[#00ff88]">
      {/* CRT Scanline Overlay Layer */}
      {scanlinesActive && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none cyber-scanlines z-50 opacity-80"
        />
      )}

      {/* Top Bar Navigation */}
      <TopBar
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onQuickAction={() => setTerminalDrawerOpen(true)}
        onEmergencyKill={() => setKillModalOpen(true)}
      />

      {/* Kill Switch Alert Toast */}
      {killSuccessNotice && (
        <div className="fixed top-20 right-4 z-50 max-w-md p-4 bg-[#ff3366]/20 border border-[#ff3366] text-xs font-mono text-[#ff3366] cyber-chamfer-sm shadow-[0_0_20px_rgba(255,51,102,0.5)] flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-[#ff3366]" />
          <div>
            <div className="font-bold uppercase tracking-wider mb-1">Emergency Kill Switch Executed</div>
            <p className="text-white text-[11px]">{killSuccessNotice}</p>
          </div>
        </div>
      )}

      <main>
        {/* Hero Section & Governor Telemetry HUD */}
        <div id="hero">
          <HeroSection
            onExploreApprovals={() => handleNavigate('approvals')}
            onOpenTerminal={() => setTerminalDrawerOpen(true)}
            scanlinesActive={scanlinesActive}
            onToggleScanlines={() => setScanlinesActive(!scanlinesActive)}
            glitchActive={glitchActive}
            onToggleGlitch={() => setGlitchActive(!glitchActive)}
            neonIntensity={neonIntensity}
            onIntensityChange={setNeonIntensity}
          />
        </div>

        {/* AI Workspace Studio & Live IDE (Open Folder, File Explorer, Prompt Console, Hot-Reload Preview) */}
        <WorkspaceStudioSection />

        {/* Human-in-the-Loop Reviewer Approval Queue */}
        <SprawlConsoleSection />

        {/* Policy & Risk Matrix (Decision Bands, HD1-HD10, Live Simulator) */}
        <PlaygroundSection />

        {/* Audit Verification, Tamper Demo & Benchmark Suite */}
        <ArchitectureSection />

        {/* Embedded Terminal Section */}
        <section id="terminal" className="py-20 border-b border-[#2a2a3a]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="space-y-2">
              <CyberMetadata
                items={['SYSTEM CONSOLE', 'GOVERNOR SOC CLI', 'DIAGNOSTICS & ENFORCEMENT']}
                separator="·"
              />
              <h2 className="text-3xl sm:text-4xl font-black uppercase text-[#e0e0e0] font-heading">
                GOVERNOR SECURITY CLI
              </h2>
              <p className="text-xs sm:text-sm font-mono text-[#a0a0b0] max-w-xl">
                Execute live verification of the cryptographic audit chain, query /v1/metrics counters,
                trigger scenario tests, or execute emergency session suspension.
              </p>
            </div>

            <CyberTerminal
              onScanlinesToggle={() => setScanlinesActive((prev) => !prev)}
              onGlitchToggle={() => setGlitchActive((prev) => !prev)}
            />
          </div>
        </section>
      </main>

      {/* Emergency Kill Switch Modal */}
      {killModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#12121a] border-2 border-[#ff3366] p-6 cyber-chamfer space-y-4 shadow-[0_0_30px_rgba(255,51,102,0.4)] animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-[#ff3366]">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
              <h3 className="text-base font-bold uppercase font-heading tracking-wider">
                CONFIRM EMERGENCY SESSION SUSPENSION
              </h3>
            </div>

            <p className="text-xs font-mono text-[#a0a0b0] leading-relaxed">
              This triggers the Governor&apos;s emergency kill switch (<code>POST /v1/sessions/&#123;id&#125;/suspend</code>).
              The session token will be immediately invalidated and all pending least-privilege grants revoked.
            </p>

            <div className="p-3 bg-[#0a0a0f] border border-[#2a2a3a] text-xs font-mono space-y-1">
              <div className="text-[#6b7280]">TARGET SESSION:</div>
              <div className="text-white font-bold">sess_prod_04 (BillingAgent)</div>
              <div className="text-[10px] text-[#ffaa00]">Boundary: prod/orders · Grants: db.write</div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <CyberButton
                variant="outline"
                size="sm"
                onClick={() => setKillModalOpen(false)}
              >
                Cancel
              </CyberButton>
              <CyberButton
                variant="secondary"
                size="sm"
                onClick={() => handleConfirmKill('sess_prod_04')}
                className="bg-[#ff3366] text-black border-[#ff3366] hover:bg-[#ff3366]/80 font-bold"
                loading={killLoading}
                loadingText="Executing..."
              >
                Execute Kill Switch
              </CyberButton>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out Terminal Modal Drawer */}
      {terminalDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-3xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setTerminalDrawerOpen(false)}
              className="absolute -top-10 right-0 text-[#6b7280] hover:text-[#ff3366] transition-colors flex items-center gap-1 text-xs font-mono cursor-pointer"
            >
              <X className="w-4 h-4" /> CLOSE CONSOLE [ESC]
            </button>
            <CyberTerminal
              onScanlinesToggle={() => setScanlinesActive((prev) => !prev)}
              onGlitchToggle={() => setGlitchActive((prev) => !prev)}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#2a2a3a] py-8 bg-[#0a0a0f]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#6b7280]">
<div className="flex items-center gap-3">
            <span className="text-[#00ff88] font-bold">NOMOS // AGENT PERMISSION GOVERNOR</span>
            <span>·</span>
            <span>AI Security Runtime</span>
            <span>·</span>
            <span className="text-white font-semibold">"The AI Agent should NEVER execute directly."</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="hover:text-[#00ff88] transition-colors cursor-pointer"
            >
              Back to Top ↑
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
