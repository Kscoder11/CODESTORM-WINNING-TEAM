/**
 * PNG5 — Agent Permission Governor
 * Type Definitions conforming to INTERFACES.md and DATA_MODEL.md
 */

export type DecisionOutcome = 'ALLOW' | 'CONSTRAIN' | 'ESCALATE' | 'DENY';

export type HardDenyRuleId =
  | 'HD1'
  | 'HD2'
  | 'HD3'
  | 'HD4'
  | 'HD5'
  | 'HD6'
  | 'HD7'
  | 'HD8'
  | 'HD9'
  | 'HD10';

export interface HardDenyRuleInfo {
  id: HardDenyRuleId;
  name: string;
  description: string;
  overridable: boolean;
}

export const HARD_DENY_RULES: Record<HardDenyRuleId, HardDenyRuleInfo> = {
  HD1: {
    id: 'HD1',
    name: 'Secret/Credential Path',
    description: 'Access to secrets, keys, or credential files forbidden.',
    overridable: false,
  },
  HD2: {
    id: 'HD2',
    name: 'Path Escape / Symlink',
    description: 'Path traversal or symlink escape outside workspace boundary.',
    overridable: false,
  },
  HD3: {
    id: 'HD3',
    name: 'Destructive Shell',
    description: 'Dangerous or destructive shell commands blocked.',
    overridable: false,
  },
  HD4: {
    id: 'HD4',
    name: 'Dangerous SQL',
    description: 'Unsafe, unconstrained, or schema-destructive SQL queries.',
    overridable: false,
  },
  HD5: {
    id: 'HD5',
    name: 'Disallowed Egress',
    description: 'Network communication to non-allowlisted destination.',
    overridable: false,
  },
  HD6: {
    id: 'HD6',
    name: 'Private Target / SSRF',
    description: 'Private, loopback, link-local, or cloud metadata target access.',
    overridable: false,
  },
  HD7: {
    id: 'HD7',
    name: 'Exfiltration Armed',
    description: 'Sensitive data exfiltration channel detected and armed.',
    overridable: false,
  },
  HD8: {
    id: 'HD8',
    name: 'Untrusted Lineage Match',
    description: 'Payload or target matches untrusted provenance/taint indicators.',
    overridable: false,
  },
  HD9: {
    id: 'HD9',
    name: 'Approval Redemption Failure',
    description: 'Request hash mismatch, expired token, or replayed approval.',
    overridable: false,
  },
  HD10: {
    id: 'HD10',
    name: 'Missing Grant',
    description: 'Session does not possess least-privilege grant for requested tool/action.',
    overridable: false,
  },
};

export type ResourceTrust = 'trusted' | 'internal' | 'user' | 'external' | 'untrusted';
export type ResourceSensitivity = 'public' | 'internal' | 'confidential' | 'restricted';
export type ResourceEnvironment = 'dev' | 'staging' | 'prod';

export interface ResourceMetadata {
  trust: ResourceTrust;
  sensitivity: ResourceSensitivity;
  environment: ResourceEnvironment;
}

export interface RiskScoreBreakdown {
  base: number;
  sensitivity: number;
  environment: number;
  taint: number;
  signals: number;
}

export interface DecisionTimings {
  decision_ms: number;
  audit_ms: number;
  exec_ms: number;
}

export interface AgentActionRequest {
  action: string;
  target: string;
  params: Record<string, unknown>;
  approval_id?: string | null;
}

export interface GovernorDecision {
  seq?: number;
  session_id?: string;
  agent_name?: string;
  timestamp?: string;
  action: string;
  target: string;
  canonical_target?: string;
  params?: Record<string, unknown>;
  canonical_params?: Record<string, unknown>;
  request_hash?: string;
  outcome: DecisionOutcome;
  score: number;
  breakdown: RiskScoreBreakdown;
  rules: string[];
  approval_id?: string | null;
  result?: Record<string, unknown> | null;
  timings: DecisionTimings;
  resource_metadata?: ResourceMetadata;
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CONSUMED';

export interface ApprovalRequest {
  id: string;
  session_id: string;
  agent_name: string;
  task: string;
  action: string;
  target: string;
  canonical_params: Record<string, unknown>;
  request_hash: string;
  score: number;
  breakdown: RiskScoreBreakdown;
  rules: string[];
  status: ApprovalStatus;
  created_at: string;
  expires_at: string;
  reviewer?: string | null;
}

export interface AuditEvent {
  seq: number;
  ts: string;
  type: 'decision' | 'approval' | 'execution' | 'session' | 'system';
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
}

export interface AuditVerifyResult {
  ok: boolean;
  first_bad_seq: number | null;
  verified_events_count?: number;
}

export interface GovernorMetrics {
  actions: {
    total: number;
    allow: number;
    constrain: number;
    escalate: number;
    deny: number;
  };
  latency: {
    decision_p50_ms: number;
    decision_p95_ms: number;
    decision_p99_ms: number;
    audit_p95_ms: number;
  };
  approvals: {
    pending: number;
    approved: number;
    denied: number;
  };
  system: {
    health: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    active_sessions: number;
    chain_intact: boolean;
    uptime_seconds: number;
  };
}

export interface BenchmarkResult {
  mode: 'OFF' | 'REGEX_ONLY' | 'FULL';
  total: number;
  attack_success_rate: number;
  benign_completion_rate: number;
  false_positive_rate: number;
  escalation_rate: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
}

export interface ScriptedScenario {
  id: number;
  title: string;
  description: string;
  agent_name: string;
  action: string;
  target: string;
  expected_outcome: DecisionOutcome;
  expected_rule?: HardDenyRuleId;
  expected_score?: number;
  key_security_concept: string;
}
