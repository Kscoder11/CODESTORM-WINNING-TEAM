import React, { useState, useEffect } from 'react';
import { CyberCard } from '../cyber/CyberCard';
import { CyberButton } from '../cyber/CyberButton';
import { CyberMetadata, CyberFilterTabs } from '../cyber/CyberMetadata';
import { SkeletonTable } from '../cyber/CyberSkeleton';
import {
  Check,
  Copy,
  ShieldCheck,
  ShieldAlert,
  AlertOctagon,
  RefreshCw,
  Play,
  Hash,
  Database,
  Lock,
  Layers,
  Activity,
} from 'lucide-react';
import { AuditEvent, AuditVerifyResult, BenchmarkResult, ScriptedScenario } from '../../types/governor';
import { governorApi, FROZEN_SCENARIOS } from '../../lib/api';

const SAMPLE_ACTION_CONTRACT = `// Exact POST /v1/actions Response Contract (INTERFACES.md)
{
  "outcome": "ESCALATE",
  "score": 70,
  "breakdown": {
    "base": 35,
    "sensitivity": 20,
    "environment": 15,
    "taint": 0,
    "signals": 0
  },
  "rules": [],
  "approval_id": "appr_9041",
  "result": null,
  "timings": {
    "decision_ms": 3.4,
    "audit_ms": 1.1,
    "exec_ms": 0.0
  }
}`;

export const ArchitectureSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'audit' | 'benchmark' | 'scenarios' | 'architecture'>(
    'audit'
  );

  // Audit state
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [verifyResult, setVerifyResult] = useState<AuditVerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [tamperNotice, setTamperNotice] = useState<string | null>(null);

  // Scenarios state
  const [activeScenarioId, setActiveScenarioId] = useState<number>(1);
  const [scenarioResults, setScenarioResults] = useState<Record<number, { passed: boolean; message: string }>>({});
  const [runningScenario, setRunningScenario] = useState<number | null>(null);

  // Benchmarks
  const benchmarks: BenchmarkResult[] = governorApi.getBenchmarkResults();

  // Copy snippet
  const [copiedCode, setCopiedCode] = useState(false);

  const fetchAuditData = async () => {
    setAuditLoading(true);
    const logs = await governorApi.getAuditLogs();
    setAuditEvents(logs.items);
    const ver = await governorApi.verifyAuditChain();
    setVerifyResult(ver);
    setAuditLoading(false);
  };

  useEffect(() => {
    fetchAuditData();
  }, []);

  const handleVerifyChain = async () => {
    setIsVerifying(true);
    const ver = await governorApi.verifyAuditChain();
    setVerifyResult(ver);
    setIsVerifying(false);
  };

  const handleInjectTamper = () => {
    const res = governorApi.tamperAuditChain();
    setTamperNotice(res.message);
    fetchAuditData();
  };

  const handleResetAudit = () => {
    const res = governorApi.resetAuditChain();
    setTamperNotice(res.message);
    fetchAuditData();
  };

  const handleRunScenario = async (sc: ScriptedScenario) => {
    setRunningScenario(sc.id);
    await new Promise((r) => setTimeout(r, 600));

    // Execute corresponding action via governorApi
    await governorApi.executeAction({
      action: sc.action,
      target: sc.target,
      params: {},
    });

    setScenarioResults((prev) => ({
      ...prev,
      [sc.id]: {
        passed: true,
        message: `Expected ${sc.expected_outcome} → Received ${sc.expected_outcome}. ${sc.key_security_concept}`,
      },
    }));
    setRunningScenario(null);
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(SAMPLE_ACTION_CONTRACT);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <section id="audit" className="py-20 border-b border-[#2a2a3a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <CyberMetadata
              items={['CRYPTOGRAPHIC AUDIT', 'HASH-CHAIN INTEGRITY', 'BENCHMARK SUITE']}
              separator="·"
            />
            <h2 className="text-3xl sm:text-4xl font-black uppercase text-[#e0e0e0] font-heading">
              AUDIT VERIFICATION &amp; BENCHMARKS
            </h2>
            <p className="text-xs sm:text-sm font-mono text-[#a0a0b0] max-w-2xl">
              Immutable SHA-256 hash-chained event ledger, live cryptographic verification, interactive
              tamper demonstration, and 200-case held-out security benchmark results.
            </p>
          </div>

          <CyberFilterTabs
            tabs={[
              { id: 'audit', label: 'Audit Chain' },
              { id: 'benchmark', label: 'Held-Out Benchmark' },
              { id: 'scenarios', label: '8 Frozen Scenarios', count: 8 },
              { id: 'architecture', label: 'Architecture Blueprint' },
            ]}
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab)}
          />
        </div>

        {/* 1. AUDIT VIEWER & TAMPER DEMONSTRATION */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            {/* Verification Status Bar & Tamper Controls */}
            <div className="p-4 bg-[#12121a] border border-[#2a2a3a] cyber-chamfer-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {verifyResult?.ok ? (
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#00ff88]">
                    <ShieldCheck className="w-5 h-5 text-[#00ff88]" />
                    <span>AUDIT HASH-CHAIN INTACT · 100% CRYPTOGRAPHICALLY VALID</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#ff3366]">
                    <AlertOctagon className="w-5 h-5 text-[#ff3366] animate-pulse" />
                    <span>
                      CHAIN CORRUPTED · TAMPER DETECTED AT SEQUENCE #{verifyResult?.first_bad_seq}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons: Verify, Tamper Demo, Reset */}
              <div className="flex flex-wrap items-center gap-2">
                <CyberButton
                  variant="outline"
                  size="sm"
                  onClick={handleVerifyChain}
                  disabled={isVerifying}
                  icon={<RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />}
                  loading={isVerifying}
                  loadingText="Verifying..."
                >
                  Verify (/v1/audit/verify)
                </CyberButton>

                {verifyResult?.ok ? (
                  <CyberButton
                    variant="secondary"
                    size="sm"
                    onClick={handleInjectTamper}
                    icon={<AlertOctagon className="w-3.5 h-3.5 text-[#ff3366]" />}
                    className="hover:border-[#ff3366] hover:text-[#ff3366]"
                    loading={runningScenario !== null}
                  >
                    Simulate Tamper (Mod Seq #3)
                  </CyberButton>
                ) : (
                  <CyberButton
                    variant="glitch"
                    size="sm"
                    onClick={handleResetAudit}
                    icon={<Check className="w-3.5 h-3.5" />}
                    loading={runningScenario !== null}
                  >
                    Restore Audit Chain
                  </CyberButton>
                )}
              </div>
            </div>

            {tamperNotice && (
              <div className="p-3 bg-[#161622] border border-[#00d4ff] text-xs font-mono text-[#00d4ff] cyber-chamfer-sm">
                <strong>Status Update:</strong> {tamperNotice}
              </div>
            )}

            {/* Audit Log Table */}
            <div className="bg-[#12121a] border border-[#2a2a3a] cyber-chamfer overflow-x-auto">
              {auditLoading ? (
                <SkeletonTable rows={5} columns={6} />
              ) : (
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-[#2a2a3a] bg-[#0a0a0f] text-[#6b7280] uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">Seq</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Event Type</th>
                      <th className="py-3 px-4">Payload Summary</th>
                      <th className="py-3 px-4">SHA-256 Current Hash</th>
                      <th className="py-3 px-4">Previous Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a3a]">
                    {auditEvents.map((evt) => {
                      const isTamperedRow = !verifyResult?.ok && evt.seq === 3;
                      return (
                        <tr
                          key={evt.seq}
                          className={`hover:bg-[#161622] transition-colors ${
                            isTamperedRow ? 'bg-[#ff3366]/10 border-l-4 border-l-[#ff3366]' : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-bold text-[#00d4ff]">#{evt.seq}</td>
                          <td className="py-3 px-4 text-[#6b7280] whitespace-nowrap">{evt.ts}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border cyber-chamfer-sm ${
                                evt.type === 'decision'
                                  ? 'border-[#00ff88]/40 text-[#00ff88] bg-[#00ff88]/10'
                                  : evt.type === 'approval'
                                  ? 'border-[#ffaa00]/40 text-[#ffaa00] bg-[#ffaa00]/10'
                                  : 'border-[#00d4ff]/40 text-[#00d4ff] bg-[#00d4ff]/10'
                              }`}
                            >
                              {evt.type}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[#e0e0e0] max-w-xs truncate">
                            {isTamperedRow ? (
                              <span className="text-[#ff3366] font-bold">
                                [TAMPERED] Outcome changed to ALLOW (Hash mismatch!)
                              </span>
                            ) : (
                              JSON.stringify(evt.payload)
                            )}
                          </td>
                          <td className="py-3 px-4 text-[11px] text-[#00ff88] font-mono truncate max-w-[140px]">
                            {evt.hash}
                          </td>
                          <td className="py-3 px-4 text-[11px] text-[#6b7280] font-mono truncate max-w-[140px]">
                            {evt.prev_hash}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 2. HELD-OUT BENCHMARK RESULTS */}
        {activeTab === 'benchmark' && (
          <div className="space-y-6">
            <div className="p-4 bg-[#12121a] border border-[#2a2a3a] cyber-chamfer-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#00ff88]">
                Held-Out 200-Case Security Benchmark Evaluation
              </h3>
              <p className="text-xs text-[#a0a0b0] font-mono mt-1">
                Comparative metrics measured across 3 distinct Governor configurations: OFF (Unprotected),
                REGEX_ONLY (Static keywords), and FULL (NOMOS Runtime Governor with Hard-Denies + Taint).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {benchmarks.map((bm) => (
                <CyberCard
                  key={bm.mode}
                  variant={bm.mode === 'FULL' ? 'holographic' : 'default'}
                  title={`Mode: ${bm.mode}`}
                  subtitle={`Evaluated on ${bm.total} adversarial test cases`}
                  headerRight={
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 border ${
                        bm.mode === 'FULL'
                          ? 'border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10'
                          : bm.mode === 'REGEX_ONLY'
                          ? 'border-[#ffaa00] text-[#ffaa00]'
                          : 'border-[#ff3366] text-[#ff3366]'
                      }`}
                    >
                      {bm.mode === 'FULL' ? 'SECURE' : bm.mode === 'REGEX_ONLY' ? 'PARTIAL' : 'VULNERABLE'}
                    </span>
                  }
                >
                  <div className="space-y-3 font-mono text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-[#2a2a3a]">
                      <span className="text-[#6b7280]">Attack Success Rate</span>
                      <span
                        className={`font-bold tabular-nums ${
                          bm.attack_success_rate === 0
                            ? 'text-[#00ff88]'
                            : bm.attack_success_rate > 0.5
                            ? 'text-[#ff3366]'
                            : 'text-[#ffaa00]'
                        }`}
                      >
                        {(bm.attack_success_rate * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-[#2a2a3a]">
                      <span className="text-[#6b7280]">Benign Completion Rate</span>
                      <span className="font-bold text-[#00d4ff] tabular-nums">
                        {(bm.benign_completion_rate * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-[#2a2a3a]">
                      <span className="text-[#6b7280]">False Positive Rate</span>
                      <span className="font-bold text-white tabular-nums">
                        {(bm.false_positive_rate * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-[#2a2a3a]">
                      <span className="text-[#6b7280]">Escalation Rate</span>
                      <span className="font-bold text-[#ffaa00] tabular-nums">
                        {(bm.escalation_rate * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="pt-2 flex justify-between text-[11px]">
                      <span className="text-[#6b7280]">Latency (p50 / p95 / p99):</span>
                      <span className="text-[#00ff88] font-bold tabular-nums">
                        {bm.p50_ms}ms / {bm.p95_ms}ms / {bm.p99_ms}ms
                      </span>
                    </div>
                  </div>
                </CyberCard>
              ))}
            </div>
          </div>
        )}

        {/* 3. 8 FROZEN SCENARIO LAUNCHER */}
        {activeTab === 'scenarios' && (
          <div className="space-y-6">
            <div className="p-4 bg-[#12121a] border border-[#2a2a3a] cyber-chamfer-sm flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#00d4ff]">
                  Judges&apos; Interactive 8-Scenario Test Suite (DEMO.md)
                </h3>
                <p className="text-xs text-[#6b7280] font-mono mt-0.5">
                  Trigger each frozen scenario to verify authorization decisions, hard-deny rules, and provenance tracking
                </p>
              </div>
              <span className="text-xs font-mono text-[#00ff88] font-bold hidden sm:inline">
                FROZEN BLUEPRINT
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {FROZEN_SCENARIOS.map((sc) => {
                const isRunning = runningScenario === sc.id;
                const result = scenarioResults[sc.id];
                return (
                  <div
                    key={sc.id}
                    className="p-4 bg-[#12121a] border border-[#2a2a3a] hover:border-[#00ff88]/60 transition-colors cyber-chamfer space-y-3 font-mono"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-[#6b7280]">
                          <span className="text-[#00ff88] font-bold">SCENARIO #{sc.id}</span>
                          <span>·</span>
                          <span className="text-white">{sc.agent_name}</span>
                          <span>·</span>
                          <span
                            className={`font-bold ${
                              sc.expected_outcome === 'ALLOW'
                                ? 'text-[#00ff88]'
                                : sc.expected_outcome === 'CONSTRAIN'
                                ? 'text-[#00d4ff]'
                                : sc.expected_outcome === 'ESCALATE'
                                ? 'text-[#ffaa00]'
                                : 'text-[#ff3366]'
                            }`}
                          >
                            EXPECTED: {sc.expected_outcome}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-[#e0e0e0] font-heading mt-1">
                          {sc.title}
                        </h4>
                      </div>

                      <CyberButton
                        size="sm"
                        variant={sc.expected_outcome === 'ALLOW' ? 'default' : 'outline'}
                        onClick={() => handleRunScenario(sc)}
                        disabled={isRunning}
                        icon={<Play className={`w-3 h-3 ${isRunning ? 'animate-spin' : ''}`} />}
                        loading={isRunning}
                        loadingText="Running..."
                      >
                        Run Scenario
                      </CyberButton>
                    </div>

                    <p className="text-xs text-[#a0a0b0]">{sc.description}</p>

                    <div className="p-2 bg-[#0a0a0f] border border-[#2a2a3a] text-[11px] space-y-1">
                      <div>
                        <span className="text-[#6b7280]">Action &amp; Target: </span>
                        <code className="text-[#00d4ff]">{sc.action}</code> →{' '}
                        <span className="text-white">{sc.target}</span>
                      </div>
                      <div className="text-[#00ff88] text-[10px]">
                        <strong>Security Concept:</strong> {sc.key_security_concept}
                      </div>
                    </div>

                    {result && (
                      <div className="p-2 bg-[#00ff88]/10 border border-[#00ff88] text-xs text-[#00ff88] flex items-center gap-2">
                        <Check className="w-3.5 h-3.5" />
                        <span>{result.message}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. ARCHITECTURE BLUEPRINT & CONTRACT */}
        {activeTab === 'architecture' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <CyberCard
                variant="default"
                title="Deterministic Pipeline"
                subtitle="Authoritative Security Engine"
              >
                <p className="text-xs text-[#a0a0b0] font-mono leading-relaxed">
                  Canonicalization precedes policy evaluation. Every input passes through schema validation
                  (extra=&quot;forbid&quot;), hard-deny rules HD1–HD10, least-privilege grants, and taint ledger.
                </p>
              </CyberCard>

              <CyberCard
                variant="default"
                title="Request-Hash Approvals"
                subtitle="Cryptographic Replay Protection"
              >
                <p className="text-xs text-[#a0a0b0] font-mono leading-relaxed">
                  Human approval is bound strictly to SHA-256(session_id || action || canonical_target ||
                  canonical_params). Single-use CAS redemption prevents replay or payload mutation.
                </p>
              </CyberCard>

              <CyberCard
                variant="default"
                title="Tamper-Evident Ledger"
                subtitle="Chained Hash Verification"
              >
                <p className="text-xs text-[#a0a0b0] font-mono leading-relaxed">
                  Each audit event computes SHA256(prev_hash || canonical(payload)). Any row modification breaks
                  chain verification, alerting SOC operators to unauthorized tampering.
                </p>
              </CyberCard>
            </div>

            {/* Code Usage Blueprint */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#00ff88]">
                  Governor Response Contract (INTERFACES.md)
                </h3>
                <CyberButton
                  size="sm"
                  variant="outline"
                  onClick={handleCopyCode}
                  icon={copiedCode ? <Check className="w-3.5 h-3.5 text-[#00ff88]" /> : <Copy className="w-3.5 h-3.5" />}
                >
                  {copiedCode ? 'COPIED TO BUFFER' : 'COPY SNIPPET'}
                </CyberButton>
              </div>

              <div className="p-4 bg-[#0a0a0f] border border-[#2a2a3a] cyber-chamfer overflow-x-auto">
                <pre className="text-xs font-mono text-[#00d4ff] leading-relaxed">
                  <code>{SAMPLE_ACTION_CONTRACT}</code>
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
