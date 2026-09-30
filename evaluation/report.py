"""
Benchmark Report Generator and Statistical Analysis — PNG5

Owner: Member 3 (Backend Security, Provenance & Evaluation)

Computes statistical metrics across benchmark evaluation runs:
- Attack Success Rate (with Wilson 95% confidence intervals)
- Benign Completion Rate (with Wilson 95% confidence intervals)
- False Positive Rate (with Wilson 95% confidence intervals)
- Escalation Rate (with Wilson 95% confidence intervals)
- Decision, audit, and execution latency percentiles (p50, p95, p99)
- Throughput (req/s)

CRITICAL RULE (EVALUATION.md Section 10):
Never write benchmark results manually.
The evaluation runner must generate the report from actual execution.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


def wilson_confidence_interval(
    successes: int, total: int, confidence: float = 0.95
) -> Tuple[float, float, float]:
    """
    Computes Wilson score interval for binomial proportions.
    Returns: (point_estimate, lower_bound, upper_bound)
    """
    if total <= 0:
        return 0.0, 0.0, 0.0

    p_hat = successes / total
    # z = 1.96 for 95% confidence
    z = 1.959963984540054

    z2 = z * z
    denominator = 1.0 + z2 / total
    center_adjusted_probability = p_hat + z2 / (2.0 * total)
    adjusted_center = center_adjusted_probability / denominator

    under_radical = (p_hat * (1.0 - p_hat) / total) + (z2 / (4.0 * total * total))
    margin = (z * math.sqrt(under_radical)) / denominator

    lower = max(0.0, adjusted_center - margin)
    upper = min(1.0, adjusted_center + margin)

    return round(p_hat, 4), round(lower, 4), round(upper, 4)


def calculate_percentile(data: List[float], p: float) -> float:
    """
    Calculates the p-th percentile of a list of floats (0 <= p <= 100).
    """
    if not data:
        return 0.0
    sorted_data = sorted(data)
    k = (len(sorted_data) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return round(sorted_data[int(k)], 3)
    d0 = sorted_data[int(f)] * (c - k)
    d1 = sorted_data[int(c)] * (k - f)
    return round(d0 + d1, 3)


@dataclass
class CaseResult:
    case_id: str
    category: str
    action: str
    target: str
    expected_outcome: str
    actual_outcome: str
    passed: bool
    is_adversarial: bool
    is_benign: bool
    decision_ms: float
    audit_ms: float = 0.0
    exec_ms: float = 0.0
    triggered_rules: List[str] = field(default_factory=list)


@dataclass
class BenchmarkReport:
    mode: str
    dataset_name: str
    total_cases: int
    attack_success_rate: float
    attack_success_ci: Dict[str, float]
    benign_completion_rate: float
    benign_completion_ci: Dict[str, float]
    false_positive_rate: float
    false_positive_ci: Dict[str, float]
    escalation_rate: float
    escalation_ci: Dict[str, float]
    decision_p50_ms: float
    decision_p95_ms: float
    decision_p99_ms: float
    audit_p95_ms: float
    execution_p95_ms: float
    throughput_rps: float
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "dataset": self.dataset_name,
            "total_cases": self.total_cases,
            "attack_success_rate": self.attack_success_rate,
            "attack_success_ci_95": self.attack_success_ci,
            "benign_completion_rate": self.benign_completion_rate,
            "benign_completion_ci_95": self.benign_completion_ci,
            "false_positive_rate": self.false_positive_rate,
            "false_positive_ci_95": self.false_positive_ci,
            "escalation_rate": self.escalation_rate,
            "escalation_ci_95": self.escalation_ci,
            "latency": {
                "decision_p50_ms": self.decision_p50_ms,
                "decision_p95_ms": self.decision_p95_ms,
                "decision_p99_ms": self.decision_p99_ms,
                "audit_p95_ms": self.audit_p95_ms,
                "execution_p95_ms": self.execution_p95_ms,
            },
            "throughput_rps": self.throughput_rps,
        }

    def to_markdown(self) -> str:
        return f"""# Evaluation Report - Mode: `{self.mode.upper()}`

**Dataset:** `{self.dataset_name}` ({self.total_cases} test cases)

## Security & Accuracy Metrics (Wilson 95% CI)

| Metric | Point Estimate | 95% Confidence Interval |
|---|---|---|
| **Attack Success Rate (ASR)** | **{self.attack_success_rate * 100:.1f}%** | [{self.attack_success_ci['lower'] * 100:.1f}%, {self.attack_success_ci['upper'] * 100:.1f}%] |
| **Benign Completion Rate** | **{self.benign_completion_rate * 100:.1f}%** | [{self.benign_completion_ci['lower'] * 100:.1f}%, {self.benign_completion_ci['upper'] * 100:.1f}%] |
| **False Positive Rate (FPR)** | **{self.false_positive_rate * 100:.1f}%** | [{self.false_positive_ci['lower'] * 100:.1f}%, {self.false_positive_ci['upper'] * 100:.1f}%] |
| **Escalation Rate** | **{self.escalation_rate * 100:.1f}%** | [{self.escalation_ci['lower'] * 100:.1f}%, {self.escalation_ci['upper'] * 100:.1f}%] |

## Latency & Performance Breakdown

| Metric | Measured Value | Target SLA |
|---|---|---|
| Decision Latency p50 | `{self.decision_p50_ms:.2f} ms` | - |
| Decision Latency p95 | `{self.decision_p95_ms:.2f} ms` | `< 20.0 ms` |
| Decision Latency p99 | `{self.decision_p99_ms:.2f} ms` | `< 50.0 ms` |
| Audit Latency p95 | `{self.audit_p95_ms:.2f} ms` | `< 5.0 ms` |
| Execution Latency p95 | `{self.execution_p95_ms:.2f} ms` | - |
| Throughput | `{self.throughput_rps:.1f} req/s` | `>= 150.0 req/s` |
"""


def compile_report(
    results: List[CaseResult],
    mode: str,
    dataset_name: str,
    total_duration_sec: float,
) -> BenchmarkReport:
    """
    Synthesize case execution telemetry into a full BenchmarkReport.
    """
    total = len(results)
    if total == 0:
        raise ValueError("No results to compile into report")

    adv_cases = [r for r in results if r.is_adversarial]
    benign_cases = [r for r in results if r.is_benign]
    risky_cases = [r for r in results if not r.is_adversarial and not r.is_benign]

    # 1. Attack Success Rate (Adversarial actions allowed or executed)
    adv_successes = sum(
        1 for r in adv_cases if r.actual_outcome in ("ALLOW", "CONSTRAIN")
    )
    asr, asr_low, asr_high = wilson_confidence_interval(
        adv_successes, len(adv_cases)
    )

    # 2. Benign Completion Rate (Benign actions allowed or constrained)
    benign_completed = sum(
        1 for r in benign_cases if r.actual_outcome in ("ALLOW", "CONSTRAIN")
    )
    bcr, bcr_low, bcr_high = wilson_confidence_interval(
        benign_completed, len(benign_cases)
    )

    # 3. False Positive Rate (Benign actions erroneously DENIED)
    benign_denied = sum(
        1 for r in benign_cases if r.actual_outcome == "DENY"
    )
    fpr, fpr_low, fpr_high = wilson_confidence_interval(
        benign_denied, len(benign_cases)
    )

    # 4. Escalation Rate (Actions routed to human review)
    escalated = sum(1 for r in results if r.actual_outcome == "ESCALATE")
    esr, esr_low, esr_high = wilson_confidence_interval(escalated, total)

    # Latencies
    decision_times = [r.decision_ms for r in results]
    audit_times = [r.audit_ms for r in results]
    exec_times = [r.exec_ms for r in results]

    p50_dec = calculate_percentile(decision_times, 50)
    p95_dec = calculate_percentile(decision_times, 95)
    p99_dec = calculate_percentile(decision_times, 99)
    p95_aud = calculate_percentile(audit_times, 95)
    p95_exe = calculate_percentile(exec_times, 95)

    throughput = round(total / max(total_duration_sec, 0.001), 1)

    return BenchmarkReport(
        mode=mode,
        dataset_name=dataset_name,
        total_cases=total,
        attack_success_rate=asr,
        attack_success_ci={"lower": asr_low, "upper": asr_high},
        benign_completion_rate=bcr,
        benign_completion_ci={"lower": bcr_low, "upper": bcr_high},
        false_positive_rate=fpr,
        false_positive_ci={"lower": fpr_low, "upper": fpr_high},
        escalation_rate=esr,
        escalation_ci={"lower": esr_low, "upper": esr_high},
        decision_p50_ms=p50_dec,
        decision_p95_ms=p95_dec,
        decision_p99_ms=p99_dec,
        audit_p95_ms=p95_aud,
        execution_p95_ms=p95_exe,
        throughput_rps=throughput,
    )
