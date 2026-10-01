# ==============================================================================
# PNG5 NOMOS — Unified All-in-One Production Dockerfile
# Hosts both Python 3.11 Policy Governor & Node 20 MCP IDE Gateway
# ==============================================================================

# Stage 1: Build Node.js TypeScript MCP Gateway
FROM node:20-alpine AS node-builder

WORKDIR /app/mcp-server
COPY mcp-server/package*.json ./
RUN npm ci

COPY mcp-server/ ./
RUN npm run build

# Stage 2: Build Python Environment
FROM python:3.11-slim AS py-builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 3: Final Production Runtime Container
FROM python:3.11-slim AS runner

WORKDIR /app

# Install Node.js runtime, curl, and git
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Copy Python packages
COPY --from=py-builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=3000
ENV GOVERNOR_URL=http://127.0.0.1:8000

# Copy application files
COPY governor/ ./governor/
COPY gateway/ ./gateway/
COPY policies/ ./policies/
COPY demo/ ./demo/
COPY frontend/ ./frontend/
COPY requirements.txt .

# Copy built MCP Server
COPY --from=node-builder /app/mcp-server/dist ./mcp-server/dist
COPY --from=node-builder /app/mcp-server/node_modules ./mcp-server/node_modules
COPY --from=node-builder /app/mcp-server/package.json ./mcp-server/package.json

# Copy entrypoint script
COPY deployment/docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Expose both IDE Web Server (3000) and Policy Governor (8000)
EXPOSE 3000 8000

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
