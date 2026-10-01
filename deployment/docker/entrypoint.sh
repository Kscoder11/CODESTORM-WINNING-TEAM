#!/usr/bin/env sh
# ==============================================================================
# PNG5 NOMOS — All-in-One Container Entrypoint
# Launches both Python Policy Governor (8000) & Node MCP IDE Gateway (3000)
# ==============================================================================
set -e

echo "============================================================"
echo "🚀 Starting PNG5 NOMOS Unified Container Services"
echo "============================================================"

# 1. Start Python FastAPI Policy Governor in background
echo "⚙️ Starting Zero-Trust Policy Governor on port 8000..."
uvicorn governor.main:app --host 0.0.0.0 --port 8000 &
GOV_PID=$!

# Wait for governor to initialize
sleep 2

# 2. Start Node.js MCP Gateway & Monaco IDE Server
echo "⚙️ Starting MCP IDE Gateway on port 3000..."
node mcp-server/dist/web-server.js &
MCP_PID=$!

# Trap signals for graceful container shutdown
trap "echo 'Stopping PNG5 services...'; kill -TERM $GOV_PID $MCP_PID 2>/dev/null; exit 0" SIGINT SIGTERM

echo "============================================================"
echo "🎉 PNG5 NOMOS Services Active:"
echo "   - Monaco IDE & AI Assistant: http://localhost:3000/ide"
echo "   - Policy Governor Backend:   http://localhost:8000"
echo "============================================================"

# Wait for child processes
wait -n $GOV_PID $MCP_PID
