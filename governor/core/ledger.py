"""
Session Ledger and Provenance Engine — PNG5

Owner: Member 3 (Backend Security, Provenance & Evaluation)

Tracks session taint, sensitivity, tool output indicators, and lineage matches.
Authoritative source of provenance context consumed by the Governor's decision engine.
"""

from __future__ import annotations

import re
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set


class TrustLevel(str, Enum):
    TRUSTED = "trusted"
    INTERNAL = "internal"
    USER = "user"
    EXTERNAL = "external"
    UNTRUSTED = "untrusted"


class SensitivityLevel(str, Enum):
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


# Taint hierarchy rank (higher rank means higher taint / risk)
TAINT_RANKS: Dict[str, int] = {
    TrustLevel.TRUSTED.value: 0,
    TrustLevel.INTERNAL.value: 0,
    TrustLevel.USER.value: 1,
    TrustLevel.EXTERNAL.value: 2,
    TrustLevel.UNTRUSTED.value: 3,
}

# Regex extractors for indicators
EMAIL_REGEX = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
URL_REGEX = re.compile(r"https?://[^\s<>'\"`)]+")
HOSTNAME_REGEX = re.compile(
    r"\b(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|edu|gov|io|ai|local|dev|internal|evil|example|corp|test)\b",
    re.IGNORECASE,
)
PATH_REGEX = re.compile(r"(?:/[a-zA-Z0-9._-]+)+")
# Identifiers >= 6 chars: structured tokens (e.g. containing digits, underscores, or hyphens)
IDENTIFIER_REGEX = re.compile(r"\b(?=[a-zA-Z0-9_-]*[0-9_-])[a-zA-Z0-9_-]{6,}\b")

# Noise filter for generic identifier tokens
STOPWORDS: Set[str] = {
    "string",
    "number",
    "object",
    "boolean",
    "return",
    "import",
    "export",
    "function",
    "default",
    "session",
    "action",
    "target",
    "params",
    "status",
    "result",
    "output",
    "content",
    "reason",
    "header",
    "payload",
    "message",
    "system",
    "update",
    "select",
    "delete",
    "insert",
}


def extract_indicators(content: str, max_indicators: int = 200) -> List[str]:
    """
    Extract key indicators from tool output content:
    - emails
    - hostnames
    - URLs
    - filesystem paths
    - identifiers >= 6 characters

    Returns a deduplicated list of indicators.
    """
    if not content or not isinstance(content, str):
        return []

    found: Set[str] = set()

    # 1. URLs
    for match in URL_REGEX.finditer(content):
        val = match.group(0).rstrip(".,;")
        if len(val) >= 6:
            found.add(val)

    # 2. Emails
    for match in EMAIL_REGEX.finditer(content):
        found.add(match.group(0).lower())

    # 3. Hostnames
    for match in HOSTNAME_REGEX.finditer(content):
        found.add(match.group(0).lower())

    # 4. Paths
    for match in PATH_REGEX.finditer(content):
        val = match.group(0)
        if len(val) >= 2 and val not in ("/", "//"):
            found.add(val)

    # 5. Identifiers >= 6 chars
    for match in IDENTIFIER_REGEX.finditer(content):
        val = match.group(0)
        lower_val = val.lower()
        if lower_val not in STOPWORDS and not lower_val.isdigit():
            found.add(val)

    # Limit to max_indicators to avoid token explosion
    return sorted(list(found))[:max_indicators]


@dataclass
class LedgerEntry:
    session_id: str
    source: str
    trust: str = TrustLevel.INTERNAL.value
    sensitivity: str = SensitivityLevel.INTERNAL.value
    indicators: List[str] = field(default_factory=list)
    injection_flag: bool = False
    ts: float = field(default_factory=time.time)
    id: str = field(default_factory=lambda: f"led_{uuid.uuid4().hex[:12]}")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "source": self.source,
            "trust": self.trust,
            "sensitivity": self.sensitivity,
            "indicators": self.indicators,
            "injection_flag": self.injection_flag,
            "ts": self.ts,
        }


class SessionLedger:
    """
    Thread-safe session provenance and taint ledger.
    Stores and evaluates taint, extracted lineage indicators, and injection alerts.
    """

    def __init__(self) -> None:
        self._entries: Dict[str, List[LedgerEntry]] = {}
        self._taint_level: Dict[str, str] = {}
        self._untrusted_indicators: Dict[str, Set[str]] = {}
        self._all_indicators: Dict[str, Set[str]] = {}

    def record(
        self,
        session_id: str,
        source: str,
        trust: str = TrustLevel.INTERNAL.value,
        sensitivity: str = SensitivityLevel.INTERNAL.value,
        indicators: Optional[List[str]] = None,
        injection_flag: bool = False,
        raw_content: Optional[str] = None,
    ) -> LedgerEntry:
        """
        Record a new tool output event or ingested content into the session ledger.
        If indicators are not explicitly provided, extracts them from raw_content or source.
        """
        trust = str(trust).lower()
        sensitivity = str(sensitivity).lower()

        # Extract indicators if not provided
        if indicators is None:
            if raw_content:
                indicators = extract_indicators(raw_content)
            else:
                indicators = extract_indicators(source)

        entry = LedgerEntry(
            session_id=session_id,
            source=source,
            trust=trust,
            sensitivity=sensitivity,
            indicators=indicators,
            injection_flag=injection_flag,
        )

        if session_id not in self._entries:
            self._entries[session_id] = []
            self._taint_level[session_id] = TrustLevel.TRUSTED.value
            self._untrusted_indicators[session_id] = set()
            self._all_indicators[session_id] = set()

        self._entries[session_id].append(entry)

        # Update session taint to the highest rank encountered
        curr_taint = self._taint_level[session_id]
        curr_rank = TAINT_RANKS.get(curr_taint, 0)
        entry_rank = TAINT_RANKS.get(trust, 0)
        if entry_rank > curr_rank:
            self._taint_level[session_id] = trust

        # Track indicators
        for ind in indicators:
            self._all_indicators[session_id].add(ind)
            if trust in (TrustLevel.UNTRUSTED.value, TrustLevel.EXTERNAL.value):
                self._untrusted_indicators[session_id].add(ind.lower())

        return entry

    def get_session_taint(self, session_id: str) -> str:
        """
        Returns the highest taint level recorded for this session.
        Defaults to 'trusted' if no entries exist.
        """
        return self._taint_level.get(session_id, TrustLevel.TRUSTED.value)

    def get_indicators(self, session_id: str) -> Set[str]:
        """
        Returns all indicators recorded for the session.
        """
        return set(self._all_indicators.get(session_id, set()))

    def get_untrusted_indicators(self, session_id: str) -> Set[str]:
        """
        Returns all indicators associated with untrusted or external sources for this session.
        """
        return set(self._untrusted_indicators.get(session_id, set()))

    def has_untrusted_indicator(self, session_id: str, value: str) -> bool:
        """
        Checks if value contains or matches any indicator extracted from untrusted/external
        sources in this session (lineage matching).
        """
        if not value or not isinstance(value, str):
            return False

        untrusted = self._untrusted_indicators.get(session_id, set())
        if not untrusted:
            return False

        lower_val = value.lower()
        for ind in untrusted:
            # Structured indicators: email, URL, hostname, path
            if "@" in ind or "/" in ind or "." in ind:
                if ind in lower_val:
                    return True
            else:
                # Generic token identifiers require exact word boundary match
                pattern = r"\b" + re.escape(ind) + r"\b"
                if re.search(pattern, lower_val):
                    return True

        return False

    def get_entries(self, session_id: str) -> List[LedgerEntry]:
        """
        Returns all ledger entries recorded for the given session.
        """
        return list(self._entries.get(session_id, []))

    def clear_session(self, session_id: str) -> None:
        """
        Clears ledger data for a session (used in testing).
        """
        self._entries.pop(session_id, None)
        self._taint_level.pop(session_id, None)
        self._untrusted_indicators.pop(session_id, None)
        self._all_indicators.pop(session_id, None)


# Default global instance for Governor and scenario integration
default_ledger = SessionLedger()


def record(
    session_id: str,
    source: str,
    trust: str = TrustLevel.INTERNAL.value,
    sensitivity: str = SensitivityLevel.INTERNAL.value,
    indicators: Optional[List[str]] = None,
    injection_flag: bool = False,
    raw_content: Optional[str] = None,
) -> LedgerEntry:
    return default_ledger.record(
        session_id=session_id,
        source=source,
        trust=trust,
        sensitivity=sensitivity,
        indicators=indicators,
        injection_flag=injection_flag,
        raw_content=raw_content,
    )


def get_session_taint(session_id: str) -> str:
    return default_ledger.get_session_taint(session_id)


def get_indicators(session_id: str) -> Set[str]:
    return default_ledger.get_indicators(session_id)


def has_untrusted_indicator(session_id: str, value: str) -> bool:
    return default_ledger.has_untrusted_indicator(session_id, value)
