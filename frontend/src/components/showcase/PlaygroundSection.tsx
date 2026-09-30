import React, { useState } from 'react';
import { CyberButton } from '../cyber/CyberButton';
import { CyberCard } from '../cyber/CyberCard';
import { CyberInput } from '../cyber/CyberInput';
import { CyberFilterTabs, CyberMetadata } from '../cyber/CyberMetadata';
import { HARD_DENY_RULES, HardDenyRuleId, GovernorDecision } from '../../types/governor';
import { governorApi } from '../../lib/api';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Play,
  RotateCcw,
  Check,
  Zap,
  Lock,
  FileCode,
  Terminal,
} from 'lucide-react';

export const PlaygroundSection: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<
    'all' | 'decisions' | 'rules' | 'tester' | 'registry'
  >('all');

  // Live action tester states
  const [testAction, setTestAction] = useState('file.read');
  const [testTarget, setTestTarget] = useState('/workspace/reports/q3_earnings.txt');
  const [evaluating, setEvaluating] = useState(false);
  const [decisionResult, setDecisionResult] = useState<GovernorDecision | null>(null);

  // Selected hard rule for detail modal/drawer
  const [selectedRuleId, setSelectedRuleId] = useState<HardDenyRuleId>('HD3');

  const handleTestEvaluate = async () => {
    setEvaluating(true);
    const result = await governorApi.executeAction({
      action: testAction,
      target: testTarget,
      params: {},
    });
    setDecisionResult(result);
    setEvaluating(false);
  };

  const setPresetScenario = (action: string, target: string) => {
    setTestAction(action);
    setTestTarget(target);
    setDecisionResult(null);
  };

  return (
    <section id="matrix" className="py-20 border-b border-[#2a2a3a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <CyberMetadata
              items={['POLICY ENGINE', 'DETERMINISTIC EVALUATION', 'DECISION BANDS']}
              separator="·"
            />
            <h2 className="text-3xl sm:text-4xl font-black uppercase text-[#e0e0e0] font-heading">
              SOC POLICY &amp; RISK MATRIX
            </h2>
            <p className="text-xs sm:text-sm font-mono text-[#a0a0b0] max-w-xl">
              Inspect the Governor&apos;s four authoritative decision bands, non-overridable hard-deny
              rules (HD1–HD10), server-side resource registry, and live dry-run action evaluator.
            </p>
          </div>

          {/* Category Filter Tabs */}
          <CyberFilterTabs
            tabs={[
              { id: 'all', label: 'All Policy Areas' },
              { id: 'decisions', label: 'Decision Bands', count: 4 },
              { id: 'rules', label: 'Hard Rules', count: 10 },
              { id: 'tester', label: 'Action Tester' },
              { id: 'registry', label: 'Resource Registry' },
            ]}
            activeTab={activeCategory}
            onTabChange={(tab) => setActiveCategory(tab)}
          />
        </div>

        {/* 1. DECISION BANDS SHOWCASE */}
        {(activeCategory === 'all' || activeCategory === 'decisions') && (
          <div className="space-y-4 p-6 bg-[#12121a]/60 border border-[#2a2a3a] cyber-chamfer">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#2a2a3a]">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#00ff88]">
                  01. Governor Decision Bands &amp; Outcome Model
                </h3>
                <p className="text-xs text-[#6b7280] font-mono mt-0.5">
                  Numerical score (0–100) synthesized from Base + Sensitivity + Environment + Taint + Signals
                </p>
              </div>

              <div className="text-xs font-mono text-[#6b7280] flex items-center gap-2">
                <span>Deterministic Authorization:</span>
                <span className="text-[#00ff88] font-bold">AUTHORITATIVE</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              {/* ALLOW */}
              <div className="p-4 bg-[#0a0a0f] border border-[#00ff88]/40 cyber-chamfer-sm space-y-2 hover:border-[#00ff88] transition-colors">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono font-bold text-[#00ff88] bg-[#00ff88]/10 px-2 py-0.5 border border-[#00ff88]">
                    ALLOW
                  </span>
                  <span className="text-xs font-mono text-[#6b7280]">Score &lt; 30</span>
                </div>
                <p className="text-xs font-mono text-[#a0a0b0]">
                  Permitted without manual intervention. Executed through controlled tool gateway.
                </p>
                <div className="pt-2 border-t border-[#2a2a3a] text-[10px] text-[#00ff88] font-mono">
                  HTTP 200 · Immediate Dispatch
                </div>
              </div>

              {/* CONSTRAIN */}
              <div className="p-4 bg-[#0a0a0f] border border-[#00d4ff]/40 cyber-chamfer-sm space-y-2 hover:border-[#00d4ff] transition-colors">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono font-bold text-[#00d4ff] bg-[#00d4ff]/10 px-2 py-0.5 border border-[#00d4ff]">
                    CONSTRAIN
                  </span>
                  <span className="text-xs font-mono text-[#6b7280]">Score 30–54</span>
                </div>
                <p className="text-xs font-mono text-[#a0a0b0]">
                  Allowed under defensive constraints: strict timeouts, read-only mode, or row limits.
                </p>
                <div className="pt-2 border-t border-[#2a2a3a] text-[10px] text-[#00d4ff] font-mono">
                  HTTP 200 · Sandboxed Scope
                </div>
              </div>

              {/* ESCALATE */}
              <div className="p-4 bg-[#0a0a0f] border border-[#ffaa00]/40 cyber-chamfer-sm space-y-2 hover:border-[#ffaa00] transition-colors">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono font-bold text-[#ffaa00] bg-[#ffaa00]/10 px-2 py-0.5 border border-[#ffaa00]">
                    ESCALATE
                  </span>
                  <span className="text-xs font-mono text-[#6b7280]">Score 55–79</span>
                </div>
                <p className="text-xs font-mono text-[#a0a0b0]">
                  Action paused. Dispatched to reviewer approval queue bound to request hash.
                </p>
                <div className="pt-2 border-t border-[#2a2a3a] text-[10px] text-[#ffaa00] font-mono">
                  HTTP 202 · Human-in-the-Loop
                </div>
              </div>

              {/* DENY */}
              <div className="p-4 bg-[#0a0a0f] border border-[#ff3366]/40 cyber-chamfer-sm space-y-2 hover:border-[#ff3366] transition-colors">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono font-bold text-[#ff3366] bg-[#ff3366]/10 px-2 py-0.5 border border-[#ff3366]">
                    DENY
                  </span>
                  <span className="text-xs font-mono text-[#6b7280]">Score ≥ 80 / HD</span>
                </div>
                <p className="text-xs font-mono text-[#a0a0b0]">
                  Blocked immediately. Hard-deny rule or severe risk violation recorded in audit chain.
                </p>
                <div className="pt-2 border-t border-[#2a2a3a] text-[10px] text-[#ff3366] font-mono">
                  HTTP 403 · Non-Overridable
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. LIVE INTERCEPTOR & DRY-RUN ACTION TESTER */}
        {(activeCategory === 'all' || activeCategory === 'tester') && (
          <div className="p-6 bg-[#12121a]/60 border border-[#2a2a3a] cyber-chamfer space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#2a2a3a]">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#00d4ff]">
                  02. Live Action Interception &amp; Dry-Run Simulator
                </h3>
                <p className="text-xs text-[#6b7280] font-mono mt-0.5">
                  Simulate autonomous agent action requests against the Governor without executing side-effects
                </p>
              </div>

              {/* Preset buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-[#6b7280]">Quick Presets:</span>
                <button
                  onClick={() => setPresetScenario('file.read', '/workspace/reports/q3_earnings.txt')}
                  className="px-2 py-1 text-[11px] font-mono bg-[#0a0a0f] border border-[#2a2a3a] hover:border-[#00ff88] text-[#a0a0b0] hover:text-[#00ff88] cyber-chamfer-sm cursor-pointer"
                >
                  Safe Read
                </button>
                <button
                  onClick={() => setPresetScenario('code.execute', 'shell:/bin/bash -c "rm -rf /"')}
                  className="px-2 py-1 text-[11px] font-mono bg-[#0a0a0f] border border-[#2a2a3a] hover:border-[#ff3366] text-[#a0a0b0] hover:text-[#ff3366] cyber-chamfer-sm cursor-pointer"
                >
                  Destructive Shell
                </button>
                <button
                  onClick={() => setPresetScenario('db.write', 'db:prod/orders')}
                  className="px-2 py-1 text-[11px] font-mono bg-[#0a0a0f] border border-[#2a2a3a] hover:border-[#ffaa00] text-[#a0a0b0] hover:text-[#ffaa00] cyber-chamfer-sm cursor-pointer"
                >
                  Prod DB Write
                </button>
                <button
                  onClick={() => setPresetScenario('http.post', 'https://webhook.site/exfil-receiver')}
                  className="px-2 py-1 text-[11px] font-mono bg-[#0a0a0f] border border-[#2a2a3a] hover:border-[#ff00ff] text-[#a0a0b0] hover:text-[#ff00ff] cyber-chamfer-sm cursor-pointer"
                >
                  Data Exfil
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Left: Input Form (6 cols) */}
              <div className="md:col-span-6 space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-[#6b7280] mb-1.5 font-mono">
                    Requested Action Type
                  </label>
                  <select
                    value={testAction}
                    onChange={(e) => setTestAction(e.target.value)}
                    className="w-full bg-[#12121a] text-[#00ff88] border border-[#2a2a3a] cyber-chamfer-sm py-2 px-3 text-xs font-mono outline-none focus:border-[#00ff88]"
                  >
                    <option value="file.read">file.read (Base: 5 pts)</option>
                    <option value="file.write">file.write (Base: 25 pts)</option>
                    <option value="db.read">db.read (Base: 15 pts)</option>
                    <option value="db.write">db.write (Base: 35 pts)</option>
                    <option value="http.get">http.get (Base: 15 pts)</option>
                    <option value="http.post">http.post (Base: 35 pts)</option>
                    <option value="email.send">email.send (Base: 30 pts)</option>
                    <option value="code.execute">code.execute (Base: 40 pts)</option>
                  </select>
                </div>

                <CyberInput
                  label="Target Resource / Command"
                  value={testTarget}
                  onChange={(e) => setTestTarget(e.target.value)}
                  prefixSymbol=">"
                  helperText="Input path, URL, database identifier, or shell payload"
                />

                <CyberButton
                  variant="default"
                  size="md"
                  onClick={handleTestEvaluate}
                  disabled={evaluating || !testTarget}
                  icon={<Play className="w-4 h-4" />}
                  className="w-full"
                  loading={evaluating}
                  loadingText="Evaluating Pipeline..."
                >
                  Evaluate Through Governor (POST /v1/actions)
                </CyberButton>
              </div>

              {/* Right: Decision Output Card (6 cols) */}
              <div className="md:col-span-6">
                {decisionResult ? (
                  <div
                    className={`p-4 bg-[#0a0a0f] border ${
                      decisionResult.outcome === 'ALLOW'
                        ? 'border-[#00ff88]'
                        : decisionResult.outcome === 'CONSTRAIN'
                        ? 'border-[#00d4ff]'
                        : decisionResult.outcome === 'ESCALATE'
                        ? 'border-[#ffaa00]'
                        : 'border-[#ff3366]'
                    } cyber-chamfer-sm space-y-3 font-mono`}
                  >
                    <div className="flex justify-between items-center pb-2 border-b border-[#2a2a3a]">
                      <div>
                        <span className="text-[10px] text-[#6b7280] uppercase block">
                          Governor Decision
                        </span>
                        <span
                          className={`text-base font-black uppercase font-heading ${
                            decisionResult.outcome === 'ALLOW'
                              ? 'text-[#00ff88]'
                              : decisionResult.outcome === 'CONSTRAIN'
                              ? 'text-[#00d4ff]'
                              : decisionResult.outcome === 'ESCALATE'
                              ? 'text-[#ffaa00]'
                              : 'text-[#ff3366]'
                          }`}
                        >
                          {decisionResult.outcome}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-[#6b7280] uppercase block">
                          Risk Score
                        </span>
                        <span className="text-base font-bold text-white font-mono tabular-nums">
                          {decisionResult.score} / 100
                        </span>
                      </div>
                    </div>

                    {decisionResult.rules.length > 0 && (
                      <div className="p-2 bg-[#ff3366]/10 border border-[#ff3366] text-xs text-[#ff3366]">
                        <strong>Triggered Hard-Deny Rule:</strong>{' '}
                        {decisionResult.rules.join(', ')} (Non-overridable)
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-[#6b7280] block">DECISION TIME</span>
                        <span className="text-[#00d4ff] font-bold">
                          {decisionResult.timings.decision_ms}ms
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#6b7280] block">AUDIT TIME</span>
                        <span className="text-[#00ff88] font-bold">
                          {decisionResult.timings.audit_ms}ms
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-[#6b7280] block mb-1">
                        CANONICAL TARGET
                      </span>
                      <code className="text-xs text-[#e0e0e0] block p-1.5 bg-[#12121a] truncate border border-[#2a2a3a]">
                        {decisionResult.canonical_target}
                      </code>
                    </div>

                    {decisionResult.request_hash && (
                      <div>
                        <span className="text-[10px] text-[#6b7280] block mb-1">
                          CANONICAL REQUEST HASH (SHA-256)
                        </span>
                        <div className="text-[10px] text-[#a0a0b0] truncate p-1 bg-[#12121a]">
                          {decisionResult.request_hash}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full min-h-[200px] flex flex-col items-center justify-center p-6 bg-[#0a0a0f] border border-[#2a2a3a] text-center font-mono text-xs text-[#6b7280] cyber-chamfer-sm">
                    <Terminal className="w-8 h-8 text-[#2a2a3a] mb-2" />
                    <span>Select an action and target to simulate real-time Governor decision.</span>
                    <span className="text-[10px] mt-1 text-[#4a4a5a]">
                      Validates against HD1–HD10 &amp; Risk Engine.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. HARD-DENY RULES CATALOG (HD1–HD10) */}
        {(activeCategory === 'all' || activeCategory === 'rules') && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#ff3366]">
                  03. Hard-Deny Rule Catalog (HD1–HD10)
                </h3>
                <p className="text-xs text-[#6b7280] font-mono mt-0.5">
                  Independent of risk score. Human approval cannot override HD1–HD8 or HD10.
                </p>
              </div>
              <span className="text-xs font-mono text-[#ff3366] font-bold">
                10 AUTHORITATIVE RULES
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {(Object.keys(HARD_DENY_RULES) as HardDenyRuleId[]).map((ruleId) => {
                const rule = HARD_DENY_RULES[ruleId];
                const isSelected = selectedRuleId === ruleId;
                return (
                  <button
                    key={ruleId}
                    onClick={() => setSelectedRuleId(ruleId)}
                    className={`p-3 bg-[#12121a] border text-left transition-all cyber-chamfer-sm cursor-pointer select-none ${
                      isSelected
                        ? 'border-[#ff3366] bg-[#1a1215] shadow-[0_0_12px_rgba(255,51,102,0.3)]'
                        : 'border-[#2a2a3a] hover:border-[#ff3366]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono font-black text-[#ff3366]">
                        {rule.id}
                      </span>
                      <Lock className="w-3 h-3 text-[#ff3366]/70" />
                    </div>
                    <div className="text-xs font-bold text-[#e0e0e0] font-mono truncate">
                      {rule.name}
                    </div>
                    <p className="text-[10px] font-mono text-[#6b7280] line-clamp-2 mt-1">
                      {rule.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. RESOURCE REGISTRY & SENSITIVITY BOUNDS */}
        {(activeCategory === 'all' || activeCategory === 'registry') && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#e0e0e0]">
                04. Server-Side Resource Registry &amp; Provenance
              </h3>
              <p className="text-xs text-[#6b7280] font-mono mt-0.5">
                Unknown targets default strictly to untrusted / restricted / prod. Agent cannot supply labels.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Trust Levels */}
              <CyberCard
                variant="default"
                title="Trust Dimensions"
                subtitle="Provenance & Origin"
                badge={<span className="text-[10px] text-[#00ff88] font-mono">REGISTRY</span>}
              >
                <div className="space-y-2 text-xs font-mono text-[#a0a0b0]">
                  <div className="flex justify-between py-1 border-b border-[#2a2a3a]">
                    <span className="text-[#00ff88]">trusted / internal</span>
                    <span className="text-white">+0 pts</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#2a2a3a]">
                    <span className="text-[#00d4ff]">user</span>
                    <span className="text-white">+5 pts</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#2a2a3a]">
                    <span className="text-[#ffaa00]">external</span>
                    <span className="text-white">+10 pts</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-[#ff3366]">untrusted (default fallback)</span>
                    <span className="text-white font-bold">+20 pts</span>
                  </div>
                </div>
              </CyberCard>

              {/* Sensitivity Levels */}
              <CyberCard
                variant="default"
                title="Sensitivity Tiers"
                subtitle="Data Confidentiality"
                badge={<span className="text-[10px] text-[#00d4ff] font-mono">REGISTRY</span>}
              >
                <div className="space-y-2 text-xs font-mono text-[#a0a0b0]">
                  <div className="flex justify-between py-1 border-b border-[#2a2a3a]">
                    <span className="text-[#00ff88]">public</span>
                    <span className="text-white">+0 pts</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#2a2a3a]">
                    <span className="text-[#00d4ff]">internal</span>
                    <span className="text-white">+5 pts</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#2a2a3a]">
                    <span className="text-[#ffaa00]">confidential</span>
                    <span className="text-white">+15 pts</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-[#ff3366]">restricted (default fallback)</span>
                    <span className="text-white font-bold">+25 pts</span>
                  </div>
                </div>
              </CyberCard>

              {/* Environment Tiers */}
              <CyberCard
                variant="default"
                title="Environment Scopes"
                subtitle="Blast Radius Containment"
                badge={<span className="text-[10px] text-[#ffaa00] font-mono">REGISTRY</span>}
              >
                <div className="space-y-2 text-xs font-mono text-[#a0a0b0]">
                  <div className="flex justify-between py-1 border-b border-[#2a2a3a]">
                    <span className="text-[#00ff88]">dev</span>
                    <span className="text-white">+0 pts</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#2a2a3a]">
                    <span className="text-[#00d4ff]">staging</span>
                    <span className="text-white">+5 pts</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-[#ff3366]">prod (default fallback)</span>
                    <span className="text-white font-bold">+20 pts</span>
                  </div>
                </div>
              </CyberCard>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
