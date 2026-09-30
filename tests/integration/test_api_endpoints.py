"""
Integration Test Suite — FastAPI Live Endpoints

Owner: Team Integration (Member 1 Core + Member 3 Security/Evaluation)

Tests all FastAPI REST endpoints with live DB, authentication headers,
action authorization, approval workflow, and audit chain verification.
"""

import pytest
import httpx
from governor.main import app
from governor.config import settings
from governor.db import init_db

# Ensure database tables are initialized
init_db()


@pytest.mark.asyncio
async def test_health_check():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.get("/healthz")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_session_lifecycle_and_action_authorization():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # 1. Create Session as Orchestrator
        sess_res = await client.post(
            "/v1/sessions",
            headers={"X-API-Key": settings.ORCHESTRATOR_KEY},
            json={
                "agent_name": "IntegrationAgent",
                "task": "Perform automated end-to-end integration tests",
                "ttl": 3600,
                "grants": [
                    {
                        "action": "file.read",
                        "target_glob": "file:/workspace/reports/*",
                        "constraints": {},
                    },
                    {
                        "action": "db.write",
                        "target_glob": "db:prod/orders",
                        "constraints": {},
                    },
                ],
            },
        )
        assert sess_res.status_code == 201
        sess_data = sess_res.json()
        session_id = sess_data["session_id"]
        token = sess_data["session_token"]
        assert session_id.startswith("sess_")
        assert token.startswith("token_")

        # 2. Authorized Safe Action -> 200 ALLOW
        act_res = await client.post(
            "/v1/actions",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "action": "file.read",
                "target": "/workspace/reports/q3.txt",
                "params": {},
            },
        )
        assert act_res.status_code == 200
        act_data = act_res.json()
        assert act_data["outcome"] == "ALLOW"
        assert act_data["score"] < 30

        # 3. Escalated Action (Prod DB Write) -> 202 ESCALATE
        esc_res = await client.post(
            "/v1/actions",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "action": "db.write",
                "target": "db:prod/orders",
                "params": {"sql": "UPDATE orders SET status = 'shipped' WHERE id = 101"},
            },
        )
        assert esc_res.status_code == 202
        esc_data = esc_res.json()
        assert esc_data["outcome"] == "ESCALATE"
        approval_id = esc_data["approval_id"]
        assert approval_id is not None

        # 4. Reviewer Lists Approvals
        app_res = await client.get(
            "/v1/approvals",
            headers={"X-API-Key": settings.REVIEWER_KEY},
        )
        assert app_res.status_code == 200
        app_list = app_res.json()["items"]
        assert any(a["id"] == approval_id for a in app_list)

        # 5. Reviewer Approves
        apprv_res = await client.post(
            f"/v1/approvals/{approval_id}/approve",
            headers={"X-API-Key": settings.REVIEWER_KEY},
            json={"reviewer_id": "human_reviewer_42"},
        )
        assert apprv_res.status_code == 200
        assert apprv_res.json()["status"] == "APPROVED"

        # 6. Agent Redeems Approval -> 200 ALLOW
        redeem_res = await client.post(
            "/v1/actions",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "action": "db.write",
                "target": "db:prod/orders",
                "params": {"sql": "UPDATE orders SET status = 'shipped' WHERE id = 101"},
                "approval_id": approval_id,
            },
        )
        assert redeem_res.status_code == 200
        assert redeem_res.json()["outcome"] == "ALLOW"

        # 7. Tampered Replay Attempt -> 403 DENY (HD9)
        replay_res = await client.post(
            "/v1/actions",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "action": "db.write",
                "target": "db:prod/orders",
                "params": {"sql": "UPDATE orders SET status = 'cancelled' WHERE id = 101"},
                "approval_id": approval_id,
            },
        )
        assert replay_res.status_code == 403
        assert replay_res.json()["outcome"] == "DENY"

        # 8. Audit Chain Verification
        audit_res = await client.get(
            "/v1/audit/verify",
            headers={"X-API-Key": settings.ADMIN_KEY},
        )
        assert audit_res.status_code == 200
        assert audit_res.json()["ok"] is True

        # 9. Metrics Endpoint
        metrics_res = await client.get("/v1/metrics")
        assert metrics_res.status_code == 200
        m_data = metrics_res.json()
        assert m_data["total_decisions"] >= 4
        assert m_data["outcomes"]["ALLOW"] >= 2
