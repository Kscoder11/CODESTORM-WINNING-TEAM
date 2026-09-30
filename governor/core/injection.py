"""
Advisory Injection Detector — PNG5

Owner: Member 3 (Backend Security, Provenance & Evaluation)

Scans ingested tool outputs and untrusted inputs for prompt injection signatures,
instruction overrides, exfiltration directives, and obfuscation tricks.

CRITICAL RULE (INTERFACES.md Section 14):
Injection detection is strictly ADVISORY.
It provides +15 risk contribution to the Governor's risk engine and generates a UI badge.
It MUST NEVER independently issue a DENY authorization decision.
"""

from __future__ import annotations

import base64
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Dict, List, Pattern, Tuple


@dataclass
class InjectionResult:
    detected: bool
    score: float
    signals: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "detected": self.detected,
            "score": round(self.score, 3),
            "signals": self.signals,
        }


# Compiled detection pattern rules: (signal_name, regex_pattern, weight)
DETECTION_RULES: List[Tuple[str, Pattern[str], float]] = [
    (
        "ignore_previous_instructions",
        re.compile(
            r"(?i)\b(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+)?(?:previous|prior|above|system|initial|safety)\s+(?:instructions|prompts|rules|directives|constraints|guidelines)\b"
        ),
        0.45,
    ),
    (
        "system_override",
        re.compile(
            r"(?i)\b(?:system\s+(?:override|prompt|mode)|admin\s+mode|root\s+access|developer\s+mode|dan\s+mode|jailbreak|unrestricted\s+mode|god\s+mode)\b"
        ),
        0.40,
    ),
    (
        "instruction_injection",
        re.compile(
            r"(?i)\b(?:you\s+must\s+now|new\s+instructions?|updated\s+directive|act\s+as\s+an?\s+unrestricted|pretend\s+you\s+have\s+no\s+rules|from\s+now\s+on\s+you\s+are)\b"
        ),
        0.35,
    ),
    (
        "credential_exfiltration",
        re.compile(
            r"(?i)\b(?:exfiltrate|send|leak|upload|forward|transmit|post)\s+(?:all\s+)?(?:passwords?|tokens?|keys?|credentials?|secrets?|api_key|database|shadow|ssh|env)\b"
        ),
        0.45,
    ),
    (
        "command_injection_directive",
        re.compile(
            r"(?i)\b(?:execute\s+(?:the\s+following|this|shell|bash|command)|run\s+command|curl\s+-[Xsk]|rm\s+-rf|chmod\s+777|wget\s+https?://|/bin/sh|/bin/bash)\b"
        ),
        0.40,
    ),
    (
        "hidden_markdown_exfiltration",
        re.compile(
            r"!\[.*?\]\((?:https?:|//)[^\s)]*(?:\?|&)(?:token|key|secret|data|p|q|leak)="
        ),
        0.50,
    ),
    (
        "prompt_leak_request",
        re.compile(
            r"(?i)\b(?:repeat\s+(?:your\s+)?system\s+prompt|what\s+is\s+your\s+system\s+prompt|print\s+(?:your\s+)?initial\s+instructions|dump\s+system\s+context)\b"
        ),
        0.30,
    ),
    (
        "delimiter_tampering",
        re.compile(
            r"(?:```(?:system|admin|root|override)|<\|im_start\|>|<\|im_end\|>|\[SYSTEM_MESSAGE\]|\[HUMAN_OVERRIDE\])"
        ),
        0.40,
    ),
]

ZERO_WIDTH_CHARS = {"\u200B", "\u200C", "\u200D", "\uFEFF", "\u2060", "\u200E", "\u200F"}


class InjectionDetector:
    """
    Heuristic and signature-based advisory injection detector.
    Identifies malicious prompt injection attempts in incoming content.
    """

    def __init__(self, sensitivity_threshold: float = 0.3) -> None:
        self.sensitivity_threshold = sensitivity_threshold

    def analyze(self, content: str) -> InjectionResult:
        """
        Analyze text content for prompt injection signals.
        Returns an InjectionResult with detected flag, calculated score, and signal tags.
        """
        if not content or not isinstance(content, str):
            return InjectionResult(detected=False, score=0.0, signals=[])

        signals: List[str] = []
        raw_score = 0.0

        # 1. Check for zero-width character obfuscation
        zero_width_count = sum(1 for char in content if char in ZERO_WIDTH_CHARS)
        if zero_width_count >= 2:
            signals.append("zero_width_obfuscation")
            raw_score += 0.35

        # Normalize unicode (NFKC) for pattern matching
        normalized = unicodedata.normalize("NFKC", content)

        # 2. Check regex pattern rules
        for sig_name, pattern, weight in DETECTION_RULES:
            if pattern.search(normalized):
                if sig_name not in signals:
                    signals.append(sig_name)
                    raw_score += weight

        # 3. Check for suspicious Base64 encoded payload
        b64_signals = self._check_base64_payloads(normalized)
        if b64_signals:
            for s in b64_signals:
                if s not in signals:
                    signals.append(s)
            raw_score += 0.40

        # Cap score between 0.0 and 1.0
        final_score = min(1.0, raw_score)
        detected = final_score >= self.sensitivity_threshold and len(signals) > 0

        return InjectionResult(
            detected=detected,
            score=final_score,
            signals=signals,
        )

    def _check_base64_payloads(self, content: str) -> List[str]:
        """
        Detect embedded base64 blocks and inspect if they decode into dangerous instructions.
        """
        b64_pattern = re.compile(r"\b[A-Za-z0-9+/]{24,}={0,2}\b")
        signals: List[str] = []

        for match in b64_pattern.finditer(content):
            candidate = match.group(0)
            try:
                decoded_bytes = base64.b64decode(candidate, validate=True)
                decoded_text = decoded_bytes.decode("utf-8", errors="ignore")
                if len(decoded_text) >= 10:
                    for sig_name, pattern, _ in DETECTION_RULES:
                        if pattern.search(decoded_text):
                            signals.append(f"base64_encoded_{sig_name}")
            except Exception:
                continue

        return signals


# Default global detector
default_detector = InjectionDetector()


def analyze(content: str) -> InjectionResult:
    """
    Convenience wrapper to analyze content with the default detector.
    """
    return default_detector.analyze(content)
