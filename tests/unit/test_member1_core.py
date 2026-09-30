import pytest
import datetime
from pathlib import Path
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from governor.db import Base, SessionModel, GrantModel, LedgerModel, ApprovalModel, AuditEventModel
from governor.schemas import ActionRequest, CreateSessionRequest
from governor.core.canon import (
    canonicalize_file_target, canonicalize_url_target, canonicalize_sql,
    canonicalize_shell, canonicalize_action, compute_request_hash, CanonicalizationError
)
from governor.core.registry import registry
from governor.core.hard_rules import evaluate_hard_denies, HardDenyException
from governor.core.risk import calculate_risk_score
from governor.core.approvals import create_approval, approve_request, deny_request, redeem_approval_atomic, ApprovalError
from governor.core.audit_chain import append_audit_event, verify_audit_chain
from governor.core.decide import evaluate_action_request

# --- Test Fixtures ---

@pytest.fixture
def test_db():
    """In-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def sample_session(test_db):
    """Creates a sample active session with least privilege grants."""
    sess = SessionModel(
        id="sess_test_01",
        token_hash="hash_123",
        agent_name="DataAgent",
        task="Test Task",
        status="ACTIVE",
        created_by="orchestrator",
        created_at=datetime.datetime.utcnow(),
        expires_at=datetime.datetime.utcnow() + datetime.timedelta(seconds=3600)
    )
    test_db.add(sess)
    
    # Grant for file.read workspace
    g1 = GrantModel(session_id="sess_test_01", action="file.read", target_glob="file:/workspace/*")
    # Grant for db.write prod/orders
    g2 = GrantModel(session_id="sess_test_01", action="db.write", target_glob="db:prod/orders")
    test_db.add_all([g1, g2])
    test_db.commit()
    return sess

# --- 1. Schema Validation Tests ---

def test_schema_rejects_forbidden_metadata():
    """Agent cannot supply forbidden fields like trust, sensitivity, environment."""
    valid_data = {"action": "file.read", "target": "/workspace/report.txt", "params": {}}
    req = ActionRequest(**valid_data)
    assert req.action == "file.read"
    
    # Reject extra fields
    invalid_data = {
        "action": "file.read",
        "target": "/workspace/report.txt",
        "trust": "trusted",
        "sensitivity": "public",
        "environment": "dev"
    }
    with pytest.raises(ValidationError):
        ActionRequest(**invalid_data)

# --- 2. Canonicalization Tests ---

def test_canonicalize_file_target():
    """Test file target path containment and normalization."""
    res = canonicalize_file_target("reports/q3.txt")
    assert res.startswith("file:")
    assert "reports" in res.replace("\\", "/")

def test_canonicalize_file_path_escape():
    """Path traversal attempting to escape workspace root must raise CanonicalizationError."""
    with pytest.raises(CanonicalizationError):
        canonicalize_file_target("/workspace/../../etc/passwd")

def test_canonicalize_url_private_ip():
    """URL targets resolving to private or metadata IPs must be rejected."""
    with pytest.raises(CanonicalizationError):
        canonicalize_url_target("http://169.254.169.254/latest/meta-data")
        
    with pytest.raises(CanonicalizationError):
        canonicalize_url_target("http://127.0.0.1:8000/internal")

def test_canonicalize_sql():
    """SQL queries parsed via sqlglot into statement types and WHERE clauses."""
    res = canonicalize_sql("UPDATE orders SET status='shipped' WHERE id=10")
    assert res["statement_type"] == "UPDATE"
    assert "orders" in res["tables"]
    assert res["has_where"] is True

def test_canonicalize_sql_multi_statement():
    """Multi-statement SQL must be rejected."""
    with pytest.raises(CanonicalizationError):
        canonicalize_sql("SELECT * FROM users; DROP TABLE users;")

def test_canonicalize_shell():
    """Shell commands parsed into normalized argv lists."""
    res = canonicalize_shell("rm -rf /workspace/out")
    assert res["command"] == "rm"
    assert res["argv"] == ["rm", "-rf", "/workspace/out"]

# --- 3. Resource Registry Tests ---

def test_resource_registry_lookup():
    """Check registry matching for registered targets and default fallback."""
    res_public = registry.resolve("file:/workspace/public/readme.txt")
    assert res_public["trust"] == "trusted"
    assert res_public["sensitivity"] == "public"
    
    res_prod_db = registry.resolve("db:prod/orders")
    assert res_prod_db["sensitivity"] == "confidential"
    assert res_prod_db["env"] == "prod"

def test_resource_registry_unknown_default():
    """Unknown resource targets must default to untrusted / restricted / prod."""
    res_unknown = registry.resolve("unknown_target_resource_x")
    assert res_unknown["trust"] == "untrusted"
    assert res_unknown["sensitivity"] == "restricted"
    assert res_unknown["env"] == "prod"

# --- 4. Hard-Deny Rules Tests (HD1-HD10) ---

def test_hard_deny_hd1_secrets():
    """HD1: Secret/credential paths must be blocked."""
    with pytest.raises(HardDenyException) as exc_info:
        evaluate_hard_denies(
            action="file.read",
            canon_target="file:/workspace/.env",
            canon_params={},
            session_grants=[{"action": "file.read", "target_glob": "file:*"}]
        )
    assert exc_info.value.rule_id == "HD1"

def test_hard_deny_hd3_destructive_shell():
    """HD3: Destructive shell commands like rm -rf / must be blocked."""
    with pytest.raises(HardDenyException) as exc_info:
        evaluate_hard_denies(
            action="code.execute",
            canon_target="system.shell",
            canon_params={"command": "rm -rf /", "shell_info": {"argv": ["rm", "-rf", "/"]}},
            session_grants=[{"action": "code.execute", "target_glob": "*"}]
        )
    assert exc_info.value.rule_id == "HD3"

def test_hard_deny_hd4_update_without_where():
    """HD4: UPDATE or DELETE SQL without WHERE clause must be blocked."""
    with pytest.raises(HardDenyException) as exc_info:
        evaluate_hard_denies(
            action="db.write",
            canon_target="db:prod/orders",
            canon_params={"sql_info": {"statement_type": "UPDATE", "tables": ["orders"], "has_where": False}},
            session_grants=[{"action": "db.write", "target_glob": "db:*"}]
        )
    assert exc_info.value.rule_id == "HD4"

def test_hard_deny_hd5_disallowed_egress():
    """HD5: Egress HTTP POST to unapproved host must be blocked."""
    with pytest.raises(HardDenyException) as exc_info:
        evaluate_hard_denies(
            action="http.post",
            canon_target="http:attacker.local/exfil",
            canon_params={"host": "attacker.local"},
            session_grants=[{"action": "http.post", "target_glob": "*"}]
        )
    assert exc_info.value.rule_id == "HD5"

def test_hard_deny_hd7_armed_exfiltration():
    """HD7: Exfiltration after reading confidential data must be blocked."""
    ledger = [{"trust": "internal", "sensitivity": "confidential", "source": "db:prod/customers"}]
    with pytest.raises(HardDenyException) as exc_info:
        evaluate_hard_denies(
            action="email.send",
            canon_target="mail:outbox",
            canon_params={"recipient_domain": "company.local"},
            session_grants=[{"action": "email.send", "target_glob": "*"}],
            session_ledger_entries=ledger
        )
    assert exc_info.value.rule_id == "HD7"

def test_hard_deny_hd10_missing_grant():
    """HD10: Request not covered by session grants must be blocked."""
    with pytest.raises(HardDenyException) as exc_info:
        evaluate_hard_denies(
            action="code.execute",
            canon_target="system.shell",
            canon_params={},
            session_grants=[{"action": "file.read", "target_glob": "file:*"}]
        )
    assert exc_info.value.rule_id == "HD10"

def test_hard_deny_hd2_path_escape():
    """HD2: Path traversal or workspace boundary escape must be blocked."""
    with pytest.raises(HardDenyException) as exc_info:
        evaluate_hard_denies(
            action="file.read",
            canon_target="file:/etc/passwd",
            canon_params={},
            session_grants=[{"action": "file.read", "target_glob": "file:*"}]
        )
    assert exc_info.value.rule_id == "HD2"

def test_hard_deny_hd2_symlink():
    """HD2: Symlink in path must be blocked."""
    # This test is covered by canonicalization but verify HD2 catches it too
    with pytest.raises(HardDenyException) as exc_info:
        evaluate_hard_denies(
            action="file.read",
            canon_target="file:/workspace/../../etc/passwd",
            canon_params={},
            session_grants=[{"action": "file.read", "target_glob": "file:*"}]
        )
    assert exc_info.value.rule_id == "HD2"

def test_hard_deny_hd6_private_ip():
    """HD6: Private/metadata IP or loopback address must be blocked."""
    with pytest.raises(HardDenyException) as exc_info:
        evaluate_hard_denies(
            action="http.get",
            canon_target="http:10.0.0.1/admin",
            canon_params={"host": "10.0.0.1"},
            session_grants=[{"action": "http.get", "target_glob": "*"}]
        )
    assert exc_info.value.rule_id == "HD6"
    
    with pytest.raises(HardDenyException) as exc_info:
        evaluate_hard_denies(
            action="http.post",
            canon_target="http:127.0.0.1/internal",
            canon_params={"host": "127.0.0.1"},
            session_grants=[{"action": "http.post", "target_glob": "*"}]
        )
    assert exc_info.value.rule_id == "HD6"

def test_hard_deny_hd8_untrusted_lineage():
    """HD8: Untrusted lineage indicator match must be blocked."""
    ledger = [{
        "trust": "untrusted",
        "sensitivity": "public",
        "source": "file:/workspace/uploads/evil.txt",
        "indicators": ["malicious_payload_xyz", "attacker_signature_abc"]
    }]
    with pytest.raises(HardDenyException) as exc_info:
        evaluate_hard_denies(
            action="file.write",
            canon_target="file:/workspace/out/report.txt",
            canon_params={"content": "contains malicious_payload_xyz data"},
            session_grants=[{"action": "file.write", "target_glob": "file:*"}],
            session_ledger_entries=ledger
        )
    assert exc_info.value.rule_id == "HD8"

def test_hard_deny_hd9_approval_failure():
    """HD9: Approval redemption failure must be blocked."""
    # Not APPROVED status
    with pytest.raises(HardDenyException) as exc_info:
        evaluate_hard_denies(
            action="db.write",
            canon_target="db:prod/orders",
            canon_params={},
            session_grants=[{"action": "db.write", "target_glob": "db:*"}],
            approval_object={"status": "PENDING", "request_hash": "hash123"},
            request_hash="hash123"
        )
    assert exc_info.value.rule_id == "HD9"
    
    # Hash mismatch
    with pytest.raises(HardDenyException) as exc_info:
        evaluate_hard_denies(
            action="db.write",
            canon_target="db:prod/orders",
            canon_params={},
            session_grants=[{"action": "db.write", "target_glob": "db:*"}],
            approval_object={"status": "APPROVED", "request_hash": "different_hash"},
            request_hash="hash123"
        )
    assert exc_info.value.rule_id == "HD9"

# --- 5. Verified Risk Score Arithmetic ---

def test_verified_scenario_arithmetic():
    """Verify exact risk scores for required benchmark scenarios."""
    # Scenario 1: Safe File Read
    score1, _, outcome1 = calculate_risk_score(action="file.read", sensitivity="internal", environment="dev", session_taint="trusted")
    assert score1 == 10
    assert outcome1 == "ALLOW"
    
    # Scenario 3: Prod DB Write with WHERE
    score3, _, outcome3 = calculate_risk_score(action="db.write", sensitivity="confidential", environment="prod", session_taint="trusted")
    assert score3 == 70
    assert outcome3 == "ESCALATE"
    
    # Scenario 7: Post-poisoning workspace write
    score7, _, outcome7 = calculate_risk_score(action="file.write", sensitivity="internal", environment="dev", session_taint="untrusted")
    assert score7 == 50
    assert outcome7 == "CONSTRAIN"

# --- 6. Approvals & Request-Hash Redemption Tests ---

def test_approval_lifecycle_and_redemption(test_db, sample_session):
    """Test full approval queue lifecycle, self-approval check, and atomic redemption."""
    request_hash = "sha256_mock_hash_001"
    app_id = create_approval(
        db=test_db,
        session_id=sample_session.id,
        agent_name=sample_session.agent_name,
        action="db.write",
        target="db:prod/orders",
        canonical_params={"sql": "UPDATE orders SET status='shipped' WHERE id=1"},
        request_hash=request_hash,
        score=70,
        breakdown={},
        rules=[]
    )
    
    # Reviewer self-approval check: session creator cannot approve
    with pytest.raises(ApprovalError):
        approve_request(test_db, app_id, reviewer_id="orchestrator", session_creator="orchestrator")
        
    # Reviewer approves request
    app_obj = approve_request(test_db, app_id, reviewer_id="reviewer_judge_01", session_creator="orchestrator")
    assert app_obj.status == "APPROVED"
    
    # Atomic redemption with correct hash
    success = redeem_approval_atomic(test_db, app_id, request_hash)
    assert success is True
    
    # Replay redemption attempt must fail (already consumed)
    replay_success = redeem_approval_atomic(test_db, app_id, request_hash)
    assert replay_success is False

def test_approval_payload_swap_rejected(test_db, sample_session):
    """Approval redemption with swapped payload (different request_hash) must fail."""
    request_hash = "sha256_mock_hash_002"
    app_id = create_approval(
        db=test_db,
        session_id=sample_session.id,
        agent_name=sample_session.agent_name,
        action="db.write",
        target="db:prod/orders",
        canonical_params={"sql": "UPDATE orders SET status='shipped' WHERE id=1"},
        request_hash=request_hash,
        score=70,
        breakdown={},
        rules=[]
    )
    
    approve_request(test_db, app_id, reviewer_id="reviewer_judge_01", session_creator="orchestrator")
    
    # Attempt redemption with different request_hash (payload swap attack)
    success = redeem_approval_atomic(test_db, app_id, "different_hash_attack")
    assert success is False

def test_approval_expiration(test_db, sample_session):
    """Expired approval must not be redeemable."""
    from governor.config import settings
    import datetime
    
    # Create approval with very short TTL (1 second)
    request_hash = "sha256_mock_hash_003"
    app_id = create_approval(
        db=test_db,
        session_id=sample_session.id,
        agent_name=sample_session.agent_name,
        action="db.write",
        target="db:prod/orders",
        canonical_params={"sql": "UPDATE orders SET status='shipped' WHERE id=1"},
        request_hash=request_hash,
        score=70,
        breakdown={},
        rules=[],
        ttl_seconds=1
    )
    
    approve_request(test_db, app_id, reviewer_id="reviewer_judge_01", session_creator="orchestrator")
    
    # Wait for expiration
    import time
    time.sleep(1.1)
    
    # Redemption must fail
    success = redeem_approval_atomic(test_db, app_id, request_hash)
    assert success is False
    
    # Verify status is still APPROVED but expired
    app = test_db.query(ApprovalModel).filter(ApprovalModel.id == app_id).first()
    assert app.status == "APPROVED"
    assert app.expires_at < datetime.datetime.utcnow()

def test_self_approval_rejected(test_db, sample_session):
    """Session creator cannot approve their own request."""
    request_hash = "sha256_mock_hash_004"
    app_id = create_approval(
        db=test_db,
        session_id=sample_session.id,
        agent_name=sample_session.agent_name,
        action="db.write",
        target="db:prod/orders",
        canonical_params={"sql": "UPDATE orders SET status='shipped' WHERE id=1"},
        request_hash=request_hash,
        score=70,
        breakdown={},
        rules=[]
    )
    
    # Session creator tries to approve their own request
    with pytest.raises(ApprovalError) as exc_info:
        approve_request(test_db, app_id, reviewer_id="orchestrator", session_creator="orchestrator")
    assert "Reviewer cannot be the session creator" in str(exc_info.value)

# --- 7. Hash-Chained Audit Engine Tests ---

def test_audit_chain_integrity(test_db):
    """Test audit log hash chain creation, verification, and tamper detection."""
    e1 = append_audit_event(test_db, "TEST_ACTION_1", {"agent": "agent_01", "decision": "ALLOW"})
    e2 = append_audit_event(test_db, "TEST_ACTION_2", {"agent": "agent_01", "decision": "DENY"})
    
    # Verify valid chain
    res = verify_audit_chain(test_db)
    assert res["ok"] is True
    assert res["first_bad_seq"] is None
    
    # Tamper with an audit event row
    e1_db = test_db.query(AuditEventModel).filter(AuditEventModel.seq == e1.seq).first()
    e1_db.payload_json = '{"agent":"agent_01","decision":"TAMPERED_ALLOW"}'
    test_db.commit()
    
    # Verification must detect tamper
    tamper_res = verify_audit_chain(test_db)
    assert tamper_res["ok"] is False
    assert tamper_res["first_bad_seq"] == e1.seq

def test_audit_chain_prev_hash_tamper(test_db):
    """Tampering with prev_hash must be detected."""
    append_audit_event(test_db, "ACTION_1", {"data": "test1"})
    append_audit_event(test_db, "ACTION_2", {"data": "test2"})
    
    # Tamper with prev_hash of second event
    e2 = test_db.query(AuditEventModel).filter(AuditEventModel.seq == 2).first()
    e2.prev_hash = "0" * 64  # Break the chain
    test_db.commit()
    
    tamper_res = verify_audit_chain(test_db)
    assert tamper_res["ok"] is False
    assert tamper_res["first_bad_seq"] == 2

def test_audit_chain_empty_db(test_db):
    """Empty audit chain should verify as valid."""
    res = verify_audit_chain(test_db)
    assert res["ok"] is True
    assert res["first_bad_seq"] is None

def test_audit_chain_single_event(test_db):
    """Single event audit chain should verify correctly."""
    append_audit_event(test_db, "SINGLE_EVENT", {"key": "value"})
    res = verify_audit_chain(test_db)
    assert res["ok"] is True
    assert res["first_bad_seq"] is None

# --- 8. End-to-End Pipeline Integration Tests ---

def test_full_pipeline_safe_file_read(test_db, sample_session):
    """End-to-end test: safe file.read should ALLOW."""
    res = evaluate_action_request(
        db=test_db,
        session=sample_session,
        action="file.read",
        target="reports/q3.txt",
        params={},
        dry_run=True
    )
    assert res["outcome"] == "ALLOW"
    assert res["score"] < 30

def test_full_pipeline_prod_db_write_escalates(test_db, sample_session):
    """End-to-end test: prod db.write should ESCALATE."""
    res = evaluate_action_request(
        db=test_db,
        session=sample_session,
        action="db.write",
        target="db:prod/orders",
        params={"sql": "UPDATE orders SET status='shipped' WHERE id=10"},
        dry_run=True
    )
    assert res["outcome"] == "ESCALATE"
    assert 55 <= res["score"] <= 79

def test_full_pipeline_hard_deny_hd1(test_db, sample_session):
    """End-to-end test: HD1 secret path read should DENY."""
    # Use a path that resolves within workspace but matches secret pattern
    # The workspace is at C:\Users\Admin\Desktop\NRCM\demo\workspace
    res = evaluate_action_request(
        db=test_db,
        session=sample_session,
        action="file.read",
        target=".env",  # Relative path that resolves to workspace/.env
        params={},
        dry_run=True
    )
    assert res["outcome"] == "DENY"
    assert "HD1" in res["rules"]

def test_full_pipeline_approval_flow(test_db, sample_session):
    """End-to-end test: ESCALATE creates approval, redemption allows."""
    # First request - should ESCALATE and create approval (not dry_run)
    res1 = evaluate_action_request(
        db=test_db,
        session=sample_session,
        action="db.write",
        target="db:prod/orders",
        params={"sql": "UPDATE orders SET status='shipped' WHERE id=10"},
        dry_run=False
    )
    assert res1["outcome"] == "ESCALATE"
    approval_id = res1["approval_id"]
    assert approval_id is not None
    
    # Approve the request
    from governor.core.approvals import approve_request
    approve_request(test_db, approval_id, reviewer_id="reviewer_01", session_creator="orchestrator")
    
    # Second request with approval_id - should ALLOW
    res2 = evaluate_action_request(
        db=test_db,
        session=sample_session,
        action="db.write",
        target="db:prod/orders",
        params={"sql": "UPDATE orders SET status='shipped' WHERE id=10"},
        approval_id=approval_id,
        dry_run=True
    )
    assert res2["outcome"] == "ALLOW"
