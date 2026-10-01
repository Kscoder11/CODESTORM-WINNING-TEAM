#!/usr/bin/env bash
# ==============================================================================
# PNG5 NOMOS — Deployment Liveness & Healthcheck Verification
# ==============================================================================
set -euo pipefail

GOV_URL="${GOVERNOR_URL:-http://localhost:8000}"
MCP_URL="${MCP_GATEWAY_URL:-http://localhost:3000}"

echo "🩺 Performing healthcheck probe against cluster..."

# 1. Probe Governor Backend
echo -n "   • Probing Policy Governor (${GOV_URL})... "
if curl -sf "${GOV_URL}/v1/audit/verify" > /dev/null 2>&1 || curl -sf "${GOV_URL}/docs" > /dev/null 2>&1; then
  echo "✅ HEALTHY"
else
  echo "❌ UNHEALTHY"
  exit 1
fi

# 2. Probe MCP Web Server & IDE Gateway
echo -n "   • Probing MCP IDE Gateway (${MCP_URL})... "
if curl -sf "${MCP_URL}/api/health" | grep -q "healthy"; then
  echo "✅ HEALTHY"
else
  echo "❌ UNHEALTHY"
  exit 1
fi

echo "✨ All cluster services responded with 200 OK."
