import React from 'react';
import { CyberButton } from '../cyber/CyberButton';
import { Terminal, Shield, AlertTriangle } from 'lucide-react';

interface TopBarProps {
  activeSection: string;
  onNavigate: (section: string) => void;
  onQuickAction: () => void;
  onEmergencyKill?: () => void;
  pendingApprovalsCount?: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  onNavigate,
  onQuickAction,
  onEmergencyKill,
  pendingApprovalsCount = 2,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-[#0a0a0f]/90 backdrop-blur-md border-b border-[#2a2a3a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#hero"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('hero');
          }}
          className={`text-lg font-black tracking-widest uppercase hover:text-white transition-colors flex items-center gap-2.5 font-heading ${
            activeSection === 'hero'
              ? 'text-[#00ff88] shadow-[0_0_12px_rgba(0,255,136,0.5)]'
              : 'text-[#00ff88]'
          }`}
        >
          <span className={`w-2.5 h-2.5 bg-[#00ff88] ${activeSection === 'hero' ? 'shadow-[0_0_12px_#00ff88]' : 'shadow-[0_0_8px_#00ff88]'} transition-shadow`} />
          <span>NOMOS // GOVERNOR</span>
          <span className={`hidden sm:inline-block text-[10px] font-mono tracking-normal font-normal border-l border-[#2a2a3a] pl-2.5 transition-colors ${
            activeSection === 'hero' ? 'text-[#00ff88]' : 'text-[#6b7280]'
          }`}>
            AI RUNTIME PERMISSION GATE
          </span>
        </a>

        {/* Zone 2: Clean text navigation links */}
        <nav className="hidden lg:flex items-center gap-5 text-xs font-mono tracking-widest uppercase">
          {[
            { id: 'studio', label: '💻 Workspace IDE' },
            { id: 'approvals', label: 'Approvals', badge: pendingApprovalsCount },
            { id: 'matrix', label: 'Policy Matrix' },
            { id: 'audit', label: 'Audit Chain' },
            { id: 'terminal', label: 'Governor CLI' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`transition-colors hover:text-[#00ff88] cursor-pointer py-1 border-b-2 flex items-center gap-1.5 ${
                activeSection === item.id
                  ? 'border-[#00ff88] text-[#00ff88] font-bold'
                  : 'border-transparent text-[#6b7280]'
              }`}
            >
              <span>{item.label}</span>
              {item.badge ? (
                <span className="px-1.5 py-0.2 bg-[#ffaa00]/20 border border-[#ffaa00] text-[#ffaa00] text-[10px] font-bold">
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        {/* Zone 3: Primary action button & status */}
        <div className="flex items-center gap-2.5">
          {onEmergencyKill && (
            <CyberButton
              variant="outline"
              size="sm"
              onClick={onEmergencyKill}
              icon={<AlertTriangle className="w-3.5 h-3.5 text-[#ff3366]" />}
              className="text-[#ff3366] hover:border-[#ff3366] hover:text-[#ff3366]"
              title="Emergency Session Kill Switch (/v1/sessions/suspend)"
            >
              Kill Switch
            </CyberButton>
          )}

          <CyberButton
            variant="default"
            size="sm"
            onClick={onQuickAction}
            icon={<Terminal className="w-3.5 h-3.5" />}
          >
            Terminal CLI
          </CyberButton>
        </div>
      </div>
    </header>
  );
};
