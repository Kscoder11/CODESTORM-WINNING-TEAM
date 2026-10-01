import React, { useState, useEffect } from 'react';
import { CyberCard } from '../cyber/CyberCard';
import { CyberButton } from '../cyber/CyberButton';
import { CyberInput } from '../cyber/CyberInput';
import { CyberMetadata, CyberFilterTabs } from '../cyber/CyberMetadata';
import { SkeletonApprovalItem } from '../cyber/CyberSkeleton';
import {
  Search,
  ShieldAlert,
  ShieldCheck,
  Clock,
  CheckCircle,
  XCircle,
  Hash,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { ApprovalRequest } from '../../types/governor';
import { governorApi } from '../../lib/api';

export const SprawlConsoleSection: React.FC = () => {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'denied'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>('appr_9041');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<boolean>(false);
  const [timeRemainingSec, setTimeRemainingSec] = useState<number>(255);

  useEffect(() => {
    setApprovalsLoading(true);
    governorApi.getApprovals().then((res) => {
      setApprovals(res.items);
      if (res.items.length > 0 && !selectedId) {
        setSelectedId(res.items[0].id);
      }
      setApprovalsLoading(false);
    });

    const timer = setInterval(() => {
      setTimeRemainingSec((prev) => (prev > 0 ? prev - 1 : 300));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const selectedApproval =
    approvals.find((a) => a.id === selectedId) || approvals[0] || null;

  const filteredApprovals = approvals.filter((a) => {
    const matchesSearch =
      a.agent_name.toLowerCase().includes(search.toLowerCase()) ||
      a.action.toLowerCase().includes(search.toLowerCase()) ||
      a.target.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase()) ||
      a.task.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (filter === 'pending') return a.status === 'PENDING';
    if (filter === 'approved') return a.status === 'APPROVED';
    if (filter === 'denied') return a.status === 'DENIED';
    return true;
  });

  const handleApprove = async (appr: ApprovalRequest) => {
    setLoadingAction(true);
    const res = await governorApi.approveRequest(appr.id, 'sec_reviewer_admin');
    setApprovals((prev) =>
      prev.map((item) =>
        item.id === appr.id ? { ...item, status: 'APPROVED', reviewer: 'sec_reviewer_admin' } : item
      )
    );
    setLoadingAction(false);
    setActionNotice(`DECISION RECORDED: ${res.message}`);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleDeny = async (appr: ApprovalRequest) => {
    setLoadingAction(true);
    const res = await governorApi.denyRequest(appr.id, 'sec_reviewer_admin');
    setApprovals((prev) =>
      prev.map((item) =>
        item.id === appr.id ? { ...item, status: 'DENIED', reviewer: 'sec_reviewer_admin' } : item
      )
    );
    setLoadingAction(false);
    setActionNotice(`DENIAL ENFORCED: ${res.message}`);
    setTimeout(() => setActionNotice(null), 4000);
  };

  return (
    <section id="approvals" className="py-20 border-b border-[#2a2a3a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <CyberMetadata
              items={['SECURITY GATEWAY', 'HUMAN-IN-THE-LOOP', 'AUTHORIZATION QUEUE']}
              separator="·"
            />
            <h2 className="text-3xl sm:text-4xl font-black uppercase text-[#e0e0e0] font-heading">
              REVIEWER APPROVAL QUEUE
            </h2>
            <p className="text-xs sm:text-sm font-mono text-[#a0a0b0] max-w-2xl">
              High-risk actions (Risk Score 55–79) are paused by the Governor awaiting explicit reviewer
              sign-off. Approvals are cryptographically bound to the canonical request hash and expire in 300s.
            </p>
          </div>

          <CyberFilterTabs
            tabs={[
              { id: 'all', label: 'All Requests' },
              {
                id: 'pending',
                label: 'Pending',
                count: approvals.filter((a) => a.status === 'PENDING').length,
              },
              {
                id: 'approved',
                label: 'Approved',
                count: approvals.filter((a) => a.status === 'APPROVED').length,
              },
              {
                id: 'denied',
                label: 'Denied',
                count: approvals.filter((a) => a.status === 'DENIED').length,
              },
            ]}
            activeTab={filter}
            onTabChange={(tab) => setFilter(tab)}
          />
        </div>

        {/* Security Rule Warning Callout */}
        <div className="p-3.5 bg-[#12121a] border-l-4 border-l-[#ffaa00] border-t border-r border-b border-[#2a2a3a] text-xs font-mono text-[#a0a0b0] flex items-center justify-between gap-3 cyber-chamfer-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#ffaa00] shrink-0" />
            <span>
              <strong className="text-[#ffaa00]">MANDATORY GOVERNANCE CONSTRAINT:</strong> Human
              approval <strong className="text-white">CANNOT</strong> override Hard-Deny rules (HD1–HD8,
              HD10). Hard-denies fail closed regardless of operator privilege.
            </span>
          </div>
          <span className="hidden md:inline text-[10px] text-[#6b7280] font-mono">
            CAS REDEMPTION ONLY
          </span>
        </div>

        {/* Action Notice Banner */}
        {actionNotice && (
          <div className="p-3 bg-[#00ff88]/10 border border-[#00ff88] text-xs font-mono text-[#00ff88] cyber-chamfer-sm flex items-center justify-between animate-in fade-in">
            <span className="font-bold flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> {actionNotice}
            </span>
            <span className="text-[10px] text-[#00ff88]/80">APPENDED TO AUDIT CHAIN</span>
          </div>
        )}

        {/* Main Grid: Approvals List + Inspect Detail View */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Feed List (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-[#12121a] p-3 border border-[#2a2a3a] cyber-chamfer-sm">
              <CyberInput
                prefixSymbol="?"
                placeholder="Search queue by agent, action (db.write), target, or task..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

<div className="space-y-3">
                {approvalsLoading ? (
                  [...Array(5)].map((_, i) => (
                    <SkeletonApprovalItem key={i} />
                  ))
                ) : (
                  <>
                    {filteredApprovals.map((appr) => {
                      const isSelected = appr.id === selectedApproval?.id;
                      return (
                        <div
                          key={appr.id}
                          onClick={() => setSelectedId(appr.id)}
                          className={`p-4 bg-[#12121a] border transition-all duration-150 cyber-chamfer cursor-pointer select-none ${
                            isSelected
                              ? 'border-[#00ff88] shadow-[0_0_15px_rgba(0,255,136,0.3)] bg-[#161622]'
                              : 'border-[#2a2a3a] hover:border-[#00d4ff]/60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              {/* Zero-Pill Unboxed Metadata */}
                              <div className="flex items-center gap-2 text-xs font-mono text-[#6b7280]">
                                <span className="text-[#00d4ff] font-bold">{appr.id}</span>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#e0e0e0] font-semibold">{appr.agent_name}</span>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#ffaa00] font-bold font-mono">
                                  SCORE {appr.score}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <code className="text-xs font-mono font-bold text-[#00ff88] bg-[#00ff88]/10 px-1.5 py-0.5 border border-[#00ff88]/30">
                                  {appr.action}
                                </code>
                                <span className="text-xs font-mono text-[#a0a0b0] truncate max-w-sm">
                                  {appr.target}
                                </span>
                              </div>

                              <p className="text-[11px] font-mono text-[#6b7280] line-clamp-1">
                                Task: {appr.task}
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <div
                                className={`text-xs font-mono font-bold uppercase px-2 py-0.5 border cyber-chamfer-sm ${
                                  appr.status === 'PENDING'
                                    ? 'border-[#ffaa00] text-[#ffaa00] bg-[#ffaa00]/10'
                                    : appr.status === 'APPROVED'
                                    ? 'border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10'
                                    : 'border-[#ff3366] text-[#ff3366] bg-[#ff3366]/10'
                                }`}
                              >
                                {appr.status}
                              </div>
                              {appr.status === 'PENDING' && (
                                <span className="text-[10px] font-mono text-[#6b7280] flex items-center justify-end gap-1 mt-1">
                                  <Clock className="w-3 h-3 text-[#ffaa00]" />
                                  {timeRemainingSec}s TTL
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {filteredApprovals.length === 0 && !approvalsLoading && (
                      <div className="p-8 text-center bg-[#12121a] border border-[#2a2a3a] cyber-chamfer text-xs font-mono text-[#6b7280]">
                        NO APPROVAL REQUESTS MATCH FILTER CRITERIA
                      </div>
                    )}
                  </>
                )}
              </div>
          </div>

          {/* Inspect Details Panel (5 cols) */}
          <div className="lg:col-span-5">
            {selectedApproval ? (
              <CyberCard
                variant="holographic"
                title="ACTION ESCALATION DETAIL"
                subtitle={selectedApproval.id}
                headerRight={
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 border ${
                      selectedApproval.status === 'PENDING'
                        ? 'border-[#ffaa00] text-[#ffaa00] bg-[#ffaa00]/10'
                        : selectedApproval.status === 'APPROVED'
                        ? 'border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10'
                        : 'border-[#ff3366] text-[#ff3366] bg-[#ff3366]/10'
                    }`}
                  >
                    {selectedApproval.status}
                  </span>
                }
              >
                <div className="space-y-4 font-mono text-xs">
                  {/* Action & Agent Header */}
                  <div>
                    <span className="text-[#6b7280] text-[10px] uppercase block">
                      Autonomous Requester
                    </span>
                    <div className="flex items-center justify-between mt-0.5">
                      <h3 className="text-sm font-bold text-[#e0e0e0] font-heading">
                        {selectedApproval.agent_name}
                      </h3>
                      <span className="text-[10px] text-[#00d4ff] font-mono">
                        Session: {selectedApproval.session_id}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#a0a0b0] mt-1">
                      {selectedApproval.task}
                    </p>
                  </div>

                  {/* Canonical Request Breakdown */}
                  <div className="p-3 bg-[#0a0a0f]/80 border border-[#2a2a3a] cyber-chamfer-sm space-y-2">
                    <div className="flex justify-between items-center text-[10px] text-[#6b7280] uppercase">
                      <span>Canonical Action &amp; Target</span>
                      <span className="text-[#00ff88]">NORMALIZED</span>
                    </div>
                    <div className="text-xs font-bold text-[#00ff88]">
                      {selectedApproval.action} →{' '}
                      <span className="text-[#e0e0e0]">{selectedApproval.target}</span>
                    </div>

                    {/* Parameters Preview */}
                    <div>
                      <span className="text-[#6b7280] text-[10px] block mb-1">
                        CANONICAL PARAMETERS
                      </span>
                      <pre className="p-2 bg-[#12121a] border border-[#2a2a3a] text-[11px] text-[#00d4ff] overflow-x-auto whitespace-pre-wrap font-mono">
                        {JSON.stringify(selectedApproval.canonical_params, null, 2)}
                      </pre>
                    </div>
                  </div>

                  {/* Request Hash Display */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-[#6b7280] uppercase mb-1">
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3 text-[#ffaa00]" /> Bound Request Hash
                      </span>
                      <span className="text-[10px] text-[#ffaa00]">SHA-256</span>
                    </div>
                    <div className="p-2 bg-[#0a0a0f] border border-[#2a2a3a] text-[10px] text-[#e0e0e0] font-mono truncate select-all">
                      {selectedApproval.request_hash}
                    </div>
                  </div>

                  {/* Risk Breakdown Matrix */}
                  <div>
                    <span className="text-[#6b7280] text-[10px] block uppercase mb-1">
                      Risk Score Breakdown (Total: {selectedApproval.score}/100)
                    </span>
                    <div className="grid grid-cols-5 gap-1.5 text-center">
                      <div className="p-1.5 bg-[#12121a] border border-[#2a2a3a]">
                        <span className="text-[9px] text-[#6b7280] block">BASE</span>
                        <span className="text-xs font-bold text-[#00ff88]">
                          +{selectedApproval.breakdown.base}
                        </span>
                      </div>
                      <div className="p-1.5 bg-[#12121a] border border-[#2a2a3a]">
                        <span className="text-[9px] text-[#6b7280] block">SENS</span>
                        <span className="text-xs font-bold text-[#00d4ff]">
                          +{selectedApproval.breakdown.sensitivity}
                        </span>
                      </div>
                      <div className="p-1.5 bg-[#12121a] border border-[#2a2a3a]">
                        <span className="text-[9px] text-[#6b7280] block">ENV</span>
                        <span className="text-xs font-bold text-[#ffaa00]">
                          +{selectedApproval.breakdown.environment}
                        </span>
                      </div>
                      <div className="p-1.5 bg-[#12121a] border border-[#2a2a3a]">
                        <span className="text-[9px] text-[#6b7280] block">TAINT</span>
                        <span className="text-xs font-bold text-[#ff00ff]">
                          +{selectedApproval.breakdown.taint}
                        </span>
                      </div>
                      <div className="p-1.5 bg-[#12121a] border border-[#2a2a3a]">
                        <span className="text-[9px] text-[#6b7280] block">SIGNAL</span>
                        <span className="text-xs font-bold text-[#6b7280]">
                          +{selectedApproval.breakdown.signals}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-[#00d4ff]/20 flex items-center justify-between gap-3">
                    <div className="text-[10px] text-[#6b7280]">
                      Reviewer: <span className="text-white">{selectedApproval.reviewer || 'sec_reviewer'}</span>
                    </div>

<div className="flex items-center gap-2">
                        <CyberButton
                          variant="secondary"
                          size="sm"
                          disabled={selectedApproval.status !== 'PENDING' || loadingAction}
                          onClick={() => handleDeny(selectedApproval)}
                          icon={<XCircle className="w-3.5 h-3.5" />}
                          className="hover:border-[#ff3366] hover:text-[#ff3366]"
                          loading={loadingAction}
                          loadingText="Denying..."
                        >
                          Deny
                        </CyberButton>

                        <CyberButton
                          variant="glitch"
                          size="sm"
                          disabled={selectedApproval.status !== 'PENDING' || loadingAction}
                          onClick={() => handleApprove(selectedApproval)}
                          icon={<CheckCircle className="w-3.5 h-3.5" />}
                          loading={loadingAction}
                          loadingText="Approving..."
                        >
                          Approve Action
                        </CyberButton>
                      </div>
                  </div>
                </div>
              </CyberCard>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};
