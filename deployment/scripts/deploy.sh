#!/usr/bin/env bash
# ==============================================================================
# PNG5 NOMOS — Production Docker Deployment Script
# ==============================================================================
set -euo pipefail

echo "============================================================"
echo "🚀 Starting PNG5 NOMOS Multi-Service Deployment"
echo "============================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"

# 1. Check for required environment variables
if [ ! -f .env ]; then
  echo "⚠️ .env file not found. Copying from .env.example..."
  cp .env.example .env
fi

# 2. Build and launch containers
echo "📦 Building and orchestrating multi-container cluster..."
docker compose build
docker compose up -d

# 3. Wait for services to become healthy
echo "⏳ Awaiting service healthchecks..."
sleep 5

# 4. Verify endpoints
bash "${SCRIPT_DIR}/health-check.sh"

echo "============================================================"
echo "🎉 PNG5 NOMOS Cluster Deployed Successfully!"
echo "   - Monaco IDE & Chat: http://localhost:3000/ide"
echo "   - Policy Governor:   http://localhost:8000"
echo "============================================================"
