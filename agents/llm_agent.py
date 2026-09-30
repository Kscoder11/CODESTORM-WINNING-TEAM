"""
Optional LLM Agent Harness — PNG5

Owner: Member 3 (Backend Security, Provenance & Evaluation)

Provides an optional LLM-driven agent harness.
CRITICAL DESIGN PRINCIPLE:
If LLM APIs or credentials are unavailable, the project runs in mock/fallback mode
without failing. All security decisions remain strictly with the Governor.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from agents.scripted import GovernorHttpClient


@dataclass
class AgentStep:
    thought: str
    action: str
    target: str
    params: Dict[str, Any]
    governor_response: Optional[Dict[str, Any]] = None


class LLMAgent:
    """
    LLM Agent interacting with tools strictly via the Governor API.
    """

    def __init__(
        self,
        agent_name: str = "AssistantAgent",
        task: str = "Perform data retrieval and report generation",
        governor_url: str = "http://localhost:8000",
        api_key: Optional[str] = None,
        mock_mode: bool = True,
    ) -> None:
        self.agent_name = agent_name
        self.task = task
        self.governor_client = GovernorHttpClient(base_url=governor_url)
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self.mock_mode = mock_mode or (not self.api_key)
        self.session_id: Optional[str] = None
        self.session_token: Optional[str] = None
        self.history: List[AgentStep] = []

    async def initialize_session(self) -> str:
        res = await self.governor_client.create_session(
            agent_name=self.agent_name,
            task=self.task,
            ttl=3600,
        )
        self.session_id = res.get("session_id", f"sess_{self.agent_name.lower()}")
        self.session_token = res.get("session_token", "test-token")
        return self.session_id

    async def step(self, prompt: str) -> AgentStep:
        """
        Execute one step: reason -> formulate tool action -> submit to Governor.
        """
        if not self.session_id:
            await self.initialize_session()

        if self.mock_mode:
            # Deterministic mock step
            step = AgentStep(
                thought="I need to read the quarterly report to answer the user request.",
                action="file.read",
                target="/workspace/reports/q3.txt",
                params={},
            )
        else:
            # If external LLM key is configured, invoke LLM completion
            step = await self._query_llm(prompt)

        # Submit proposed action to Governor
        resp = await self.governor_client.execute_action(
            session_id=self.session_id,  # type: ignore
            action_payload={
                "action": step.action,
                "target": step.target,
                "params": step.params,
            },
            session_token=self.session_token,
        )
        step.governor_response = resp
        self.history.append(step)
        return step

    async def _query_llm(self, prompt: str) -> AgentStep:
        """
        Optional external LLM call. Fallbacks cleanly if unavailable.
        """
        try:
            import httpx

            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            body = {
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are an assistant. When you want to use a tool, return a JSON object with: "
                            "thought, action, target, params."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers=headers,
                    json=body,
                )
                if res.status_code == 200:
                    data = res.json()
                    content = data["choices"][0]["message"]["content"]
                    parsed = json.loads(content)
                    return AgentStep(
                        thought=parsed.get("thought", ""),
                        action=parsed.get("action", "file.read"),
                        target=parsed.get("target", "/workspace/reports/q3.txt"),
                        params=parsed.get("params", {}),
                    )
        except Exception:
            pass

        # Fallback
        return AgentStep(
            thought="Fallback plan: read local workspace file.",
            action="file.read",
            target="/workspace/reports/q3.txt",
            params={},
        )
