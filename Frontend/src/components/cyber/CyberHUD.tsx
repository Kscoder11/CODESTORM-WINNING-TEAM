import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Eye, Sparkles, Volume2, VolumeX, ShieldAlert, Cpu } from 'lucide-react';
import { CyberCard } from './CyberCard';
import { CyberButton } from './CyberButton';

interface CyberHUDProps {
  scanlinesActive: boolean;
  onToggleScanlines: () => void;
  glitchActive: boolean;
  onToggleGlitch: () => void;
  neonIntensity: 'low' | 'medium' | 'high';
  onIntensityChange: (intensity: 'low' | 'medium' | 'high') => void;
  className?: string;
}

export const CyberHUD: React.FC<CyberHUDProps> = ({
  scanlinesActive,
  onToggleScanlines,
  glitchActive,
  onToggleGlitch,
  neonIntensity,
  onIntensityChange,
  className = '',
}) => {
  const [time, setTime] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [interceptCount, setInterceptCount] = useState(1248);

  const playCyberTone = (freq = 880, duration = 0.06) => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch {
      // Audio context might be restricted
    }
  };

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTime(
        d.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);

    const interceptInterval = setInterval(() => {
      setInterceptCount((p) => p + 1);
    }, 4500);

    return () => {
      clearInterval(interval);
      clearInterval(interceptInterval);
    };
  }, []);

  return (
    <CyberCard
      variant="holographic"
      title="GOVERNOR TELEMETRY HUD"
      subtitle="RUNTIME INTERCEPTION GATEWAY"
      headerRight={
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[#00ff88] animate-ping" />
          <span className="text-[11px] font-mono text-[#00ff88] tabular-nums font-bold">
            {time || '00:00:00'}
          </span>
        </div>
      }
      className={className}
    >
      <div className="space-y-4 font-mono text-xs">
        {/* Real-time stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-[#0a0a0f]/60 border border-[#2a2a3a] cyber-chamfer-sm">
          <div>
            <span className="text-[#6b7280] block text-[10px] uppercase">Enforcement State</span>
            <span className="text-[#00ff88] font-bold flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5" /> ACTIVE / ENFORCING
            </span>
          </div>
          <div>
            <span className="text-[#6b7280] block text-[10px] uppercase">Actions Intercepted</span>
            <span className="text-[#00d4ff] font-bold tabular-nums mt-0.5 block">
              {interceptCount.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-[#6b7280] block text-[10px] uppercase">Decision p95</span>
            <span className="text-[#00ff88] font-bold tabular-nums mt-0.5 block">
              8.4ms
            </span>
          </div>
        </div>

        {/* Active Session & Provenance Context */}
        <div className="p-3 bg-[#12121a] border border-[#2a2a3a] space-y-1.5 cyber-chamfer-sm">
          <div className="flex justify-between items-center text-[10px] text-[#6b7280] uppercase">
            <span>Primary Active Session</span>
            <span className="text-[#00ff88]">ISOLATED (NO EGRESS)</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-[#e0e0e0] font-bold">sess_prod_04 (BillingAgent)</span>
            <span className="text-[#ffaa00] text-[10px] font-mono">1 PENDING APPROVAL</span>
          </div>
          <div className="text-[10px] text-[#6b7280] truncate">
            Task: Reconcile Q3 enterprise billing anomalies · Boundary: /workspace
          </div>
        </div>

        {/* HUD Interactive Controls */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[#e0e0e0] flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
              <Eye className="w-3.5 h-3.5 text-[#00ff88]" /> CRT Scanlines
            </span>
            <CyberButton
              size="sm"
              variant={scanlinesActive ? 'default' : 'outline'}
              onClick={() => {
                onToggleScanlines();
                playCyberTone(scanlinesActive ? 440 : 880);
              }}
            >
              {scanlinesActive ? 'ENABLED' : 'OFF'}
            </CyberButton>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#e0e0e0] flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
              <Sparkles className="w-3.5 h-3.5 text-[#ff00ff]" /> Glitch Pulse FX
            </span>
            <CyberButton
              size="sm"
              variant={glitchActive ? 'secondary' : 'outline'}
              onClick={() => {
                onToggleGlitch();
                playCyberTone(glitchActive ? 400 : 960);
              }}
            >
              {glitchActive ? 'ACTIVE' : 'MUTED'}
            </CyberButton>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#e0e0e0] flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-[#00d4ff]" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-[#6b7280]" />
              )}
              Haptic Audio
            </span>
            <CyberButton
              size="sm"
              variant={soundEnabled ? 'cyan' : 'outline'}
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) playCyberTone(1200);
              }}
            >
              {soundEnabled ? 'ACTIVE' : 'MUTED'}
            </CyberButton>
          </div>

          {/* Glow Intensity Selector */}
          <div className="pt-2 border-t border-[#2a2a3a]">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] text-[#6b7280] uppercase tracking-wider">
                Telemetry Glow Intensity
              </span>
              <span className="text-[10px] text-[#00ff88] uppercase font-bold">
                {neonIntensity}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => {
                    onIntensityChange(level);
                    playCyberTone(level === 'low' ? 600 : level === 'medium' ? 800 : 1000);
                  }}
                  className={`py-1 text-[10px] font-mono uppercase tracking-wider cyber-chamfer-sm transition-all cursor-pointer ${
                    neonIntensity === level
                      ? 'bg-[#00ff88] text-[#0a0a0f] font-bold shadow-[0_0_10px_#00ff88]'
                      : 'bg-[#12121a] text-[#6b7280] border border-[#2a2a3a] hover:text-[#e0e0e0]'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </CyberCard>
  );
};
