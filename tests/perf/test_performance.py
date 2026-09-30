"""
Performance Benchmark Test Suite — PNG5

Owner: Member 3 (Backend Security, Provenance & Evaluation)

Validates latency SLAs and throughput requirements specified in EVALUATION.md:
- Decision latency p95 < 20.0 ms
- Decision latency p99 < 50.0 ms
- Audit latency p95 < 5.0 ms
- Throughput >= 150.0 req/s
"""

from __future__ import annotations

import time
import pytest
from evaluation.report import calculate_percentile
from evaluation.runner import BenchmarkRunner


def test_decision_and_audit_latency_targets():
    """
    Run 120 dev benchmark cases and verify measured latencies satisfy SLA targets.
    """
    runner = BenchmarkRunner(mode="full")
    report = runner.run_file("evaluation/dev.json")

    # Verify SLA targets
    assert report.decision_p95_ms < 20.0, f"Decision p95 {report.decision_p95_ms}ms exceeded 20ms SLA"
    assert report.decision_p99_ms < 50.0, f"Decision p99 {report.decision_p99_ms}ms exceeded 50ms SLA"
    assert report.audit_p95_ms < 5.0, f"Audit p95 {report.audit_p95_ms}ms exceeded 5ms SLA"
    assert report.throughput_rps >= 150.0, f"Throughput {report.throughput_rps} rps below 150 rps target"


def test_heldout_dataset_performance():
    """
    Verify performance targets on the 80 held-out evaluation cases.
    """
    runner = BenchmarkRunner(mode="full")
    report = runner.run_file("evaluation/heldout.json")

    assert report.total_cases == 80
    assert report.decision_p95_ms < 20.0
    assert report.decision_p99_ms < 50.0
    assert report.audit_p95_ms < 5.0
