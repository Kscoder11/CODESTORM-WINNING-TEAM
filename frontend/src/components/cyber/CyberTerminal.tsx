import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Send, Trash2, Cpu, ShieldCheck } from 'lucide-react';
import { CyberCard } from './CyberCard';
import { governorApi, FROZEN_SCENARIOS } from '../../lib/api';
import { HARD_DENY_RULES, HardDenyRuleId } from '../../types/governor';

interface LogEntry {
  id: string;
  type: 'command' | 'output' | 'error' | 'success' | 'system';
  text: string;
  timestamp: string;
}

interface CyberTerminalProps {
  onScanlinesToggle?: () => void;
  onGlitchToggle?: () => void;
  className?: string;
}

export const CyberTerminal: React.FC<CyberTerminalProps> = ({
  onScanlinesToggle,
  onGlitchToggle,
  className = '',
}) => {
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      type: 'system',
      text: 'NOMOS KERNEL v1.0.0 [AGENT PERMISSION GOVERNOR SOC LOADED]',
      timestamp: '00:00:01',
    },
    {
      id: 'init-2',
      type: 'system',
      text: 'Hard-Deny Rules HD1–HD10 active · Resource Registry initialized (Default: untrusted/restricted/prod)',
      timestamp: '00:00:02',
    },
    {
      id: 'init-3',
      type: 'output',
      text: 'Type "help" for a list of security CLI commands or "metrics" to inspect active decision counters.',
      timestamp: '00:00:03',
    },
  ]);
  const [executing, setExecuting] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getTimestamp = () => {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
  };

  const handleExecute = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCmd = input.trim();
    if (!cleanCmd) return;

    const time = getTimestamp();
    const newLogs: LogEntry[] = [
      ...logs,
      {
        id: `cmd-${Date.now()}`,
        type: 'command',
        text: `> ${cleanCmd}`,
        timestamp: time,
      },
    ];

    setCmdHistory((prev) => [...prev, cleanCmd]);
    setHistoryIndex(-1);
    setInput('');
    setExecuting(true);

    const lower = cleanCmd.toLowerCase();
    const parts = cleanCmd.split(' ');
    const mainCmd = parts[0].toLowerCase();

    if (lower === 'help') {
      newLogs.push({
        id: `out-${Date.now()}`,
        type: 'output',
        text: `NOMOS GOVERNOR SOC COMMANDS:
  metrics        - Query measured action counts, outcome distribution & p50/p95 latency
  verify         - Verify cryptographic SHA-256 audit hash-chain (/v1/audit/verify)
  tamper         - Simulate audit row modification to demonstrate tamper detection
  reset-audit    - Restore audit chain to valid state
  scenarios      - List the 8 frozen demo benchmark scenarios
  run <id>       - Trigger scenario 1-8 through Governor interception pipeline
  rules          - Display Hard-Deny rules catalog (HD1-HD10)
  kill <sess_id> - Emergency session kill switch (/v1/sessions/{id}/suspend)
  scanlines      - Toggle CRT scanline mesh overlay
  glitch         - Trigger chromatic aberration glitch test
  tokens         - Print active design tokens & color hexes
  clear          - Clear terminal buffer screen`,
        timestamp: time,
      });
    } else if (lower === 'metrics') {
      const m = await governorApi.getMetrics();
      newLogs.push({
        id: `out-${Date.now()}`,
        type: 'success',
        text: `GOVERNOR MEASURED METRICS (/v1/metrics):
  Total Intercepted Actions: ${m.actions.total}
    ALLOW:      ${m.actions.allow}
    CONSTRAIN:  ${m.actions.constrain}
    ESCALATE:   ${m.actions.escalate}
    DENY:       ${m.actions.deny}
  Latency:
    Decision p50: ${m.latency.decision_p50_ms}ms
    Decision p95: ${m.latency.decision_p95_ms}ms
    Decision p99: ${m.latency.decision_p99_ms}ms
    Audit p95:    ${m.latency.audit_p95_ms}ms
  System Health: ${m.system.health} · Active Sessions: ${m.system.active_sessions} · Audit Intact: ${m.system.chain_intact}`,
        timestamp: time,
      });
    } else if (lower === 'verify') {
      const v = await governorApi.verifyAuditChain();
      if (v.ok) {
        newLogs.push({
          id: `out-${Date.now()}`,
          type: 'success',
          text: `GET /v1/audit/verify -> OK: true
Audit chain is cryptographically intact. All ${v.verified_events_count || 5} sequences verified via SHA-256 prev_hash links.`,
          timestamp: time,
        });
      } else {
        newLogs.push({
          id: `out-${Date.now()}`,
          type: 'error',
          text: `GET /v1/audit/verify -> OK: false
SECURITY ALERT: Audit chain corrupted! First bad sequence detected: #${v.first_bad_seq}. Cryptographic mismatch in event hash.`,
          timestamp: time,
        });
      }
    } else if (lower === 'tamper') {
      governorApi.tamperAuditChain();
      newLogs.push({
        id: `out-${Date.now()}`,
        type: 'error',
        text: `TAMPER INJECTED: Modified payload in audit sequence #3 (outcome altered from DENY to ALLOW). Run "verify" to observe failure.`,
        timestamp: time,
      });
    } else if (lower === 'reset-audit') {
      governorApi.resetAuditChain();
      newLogs.push({
        id: `out-${Date.now()}`,
        type: 'success',
        text: `AUDIT RESTORED: Chain restored to authentic signed SHA-256 hashes. Run "verify" to confirm.`,
        timestamp: time,
      });
    } else if (lower === 'rules') {
      const ruleList = (Object.keys(HARD_DENY_RULES) as HardDenyRuleId[])
        .map((k) => `  ${k}: ${HARD_DENY_RULES[k].name} - ${HARD_DENY_RULES[k].description}`)
        .join('\n');
      newLogs.push({
        id: `out-${Date.now()}`,
        type: 'output',
        text: `HARD-DENY RULES (HD1–HD10 - NON-OVERRIDABLE):\n${ruleList}`,
        timestamp: time,
      });
    } else if (lower === 'scenarios') {
      const scList = FROZEN_SCENARIOS.map(
        (s) => `  [#${s.id}] ${s.title}: ${s.action} -> ${s.target} [Expected: ${s.expected_outcome}]`
      ).join('\n');
      newLogs.push({
        id: `out-${Date.now()}`,
        type: 'output',
        text: `FROZEN DEMO SCENARIOS (DEMO.md):\n${scList}`,
        timestamp: time,
      });
    } else if (mainCmd === 'run') {
      const scId = parseInt(parts[1], 10);
      const scenario = FROZEN_SCENARIOS.find((s) => s.id === scId);
      if (!scenario) {
        newLogs.push({
          id: `out-${Date.now()}`,
          type: 'error',
          text: `Invalid scenario ID: "${parts[1]}". Enter a number from 1 to 8. Type "scenarios" to view list.`,
          timestamp: time,
        });
      } else {
        const res = await governorApi.executeAction({
          action: scenario.action,
          target: scenario.target,
          params: {},
        });
        newLogs.push({
          id: `out-${Date.now()}`,
          type: res.outcome === 'DENY' ? 'error' : res.outcome === 'ESCALATE' ? 'command' : 'success',
          text: `SCENARIO #${scenario.id} EXECUTION:
  Requester: ${scenario.agent_name}
  Action:    ${scenario.action}
  Target:    ${scenario.target}
  OUTCOME:   ${res.outcome} (Score: ${res.score}/100)
  RULES:     ${res.rules.length > 0 ? res.rules.join(', ') : 'None'}
  TIMINGS:   decision: ${res.timings.decision_ms}ms · audit: ${res.timings.audit_ms}ms`,
          timestamp: time,
        });
      }
    } else if (mainCmd === 'kill') {
      const sessId = parts[1] || 'sess_prod_04';
      const killRes = await governorApi.suspendSession(sessId);
      newLogs.push({
        id: `out-${Date.now()}`,
        type: 'error',
        text: `EMERGENCY KILL SWITCH TRIGGERED: ${killRes.message}`,
        timestamp: time,
      });
    } else if (lower === 'tokens') {
      newLogs.push({
        id: `out-${Date.now()}`,
        type: 'success',
        text: `DESIGN TOKENS ACTIVE:
  --cyber-bg: #0a0a0f (Void Black)
  --cyber-fg: #e0e0e0 (Primary Pale Text)
  --cyber-accent: #00ff88 (ALLOW - Neon Green)
  --cyber-secondary: #ff00ff (ESCALATE - Hot Magenta)
  --cyber-tertiary: #00d4ff (CONSTRAIN - Electric Cyan)
  --cyber-destructive: #ff3366 (DENY - Destructive Red)
  --cyber-border: #2a2a3a`,
        timestamp: time,
      });
    } else if (lower === 'scanlines') {
      onScanlinesToggle?.();
      newLogs.push({
        id: `out-${Date.now()}`,
        type: 'success',
        text: 'STATUS: CRT scanlines layer toggled.',
        timestamp: time,
      });
    } else if (lower === 'glitch') {
      onGlitchToggle?.();
      newLogs.push({
        id: `out-${Date.now()}`,
        type: 'success',
        text: 'STATUS: Chromatic aberration pulse dispatched.',
        timestamp: time,
      });
    } else if (lower === 'clear') {
      setLogs([]);
      return;
    } else {
      newLogs.push({
        id: `out-${Date.now()}`,
        type: 'error',
        text: `COMMAND NOT RECOGNIZED: "${cleanCmd}". Type "help" for syntax.`,
        timestamp: time,
      });
    }

    setExecuting(false);
    setLogs(newLogs);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const nextIdx =
        historyIndex === -1 ? cmdHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setInput(cmdHistory[nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      if (historyIndex < cmdHistory.length - 1) {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setInput(cmdHistory[nextIdx]);
      } else {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  return (
    <CyberCard
      variant="terminal"
      title="GOVERNOR_SOC_SHELL :: INTERACTIVE_CLI"
      headerRight={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLogs([])}
            title="Clear buffer"
            className="text-[#6b7280] hover:text-[#ff3366] transition-colors p-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      }
      className={`font-mono text-xs ${className}`}
    >
      {/* Terminal Output Stream */}
      <div className="h-64 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-[#2a2a3a] scrollbar-track-transparent">
        {logs.map((log) => {
          let color = 'text-[#e0e0e0]';
          if (log.type === 'command') color = 'text-[#00ff88] font-bold';
          if (log.type === 'system') color = 'text-[#00d4ff]';
          if (log.type === 'success') color = 'text-[#00ff88]';
          if (log.type === 'error') color = 'text-[#ff3366]';

          return (
            <div key={log.id} className="leading-relaxed whitespace-pre-wrap">
              <span className="text-[#6b7280] select-none mr-2 font-mono text-[10px]">
                [{log.timestamp}]
              </span>
              <span className={color}>{log.text}</span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

{/* Input Line */}
      <form
        onSubmit={handleExecute}
        className="mt-3 pt-3 border-t border-[#2a2a3a] flex items-center gap-2"
      >
        <span className="text-[#00ff88] font-bold select-none">{'>'}</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Commands: help, metrics, verify, tamper, scenarios, run 1-8, kill <id>..."
          className="flex-1 bg-transparent text-[#00ff88] outline-none border-none text-xs placeholder:text-[#6b7280]"
          disabled={executing}
        />
        {executing ? (
          <span className="flex items-center gap-2 text-xs text-[#00d4ff] font-mono">
            <svg
              className="animate-spin w-4 h-4"
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
            <span>Executing...</span>
          </span>
        ) : (
          <button
            type="submit"
            className="text-[#00ff88] hover:text-white p-1 hover:bg-[#00ff88]/20 transition-colors cyber-chamfer-sm"
            title="Send command"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        )}
      </form>
    </CyberCard>
  );
};
