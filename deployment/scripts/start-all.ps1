# ==============================================================================
# PNG5 NOMOS — Windows Native Development Cluster Startup
# ==============================================================================
$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🚀 Launching PNG5 NOMOS Services (Windows Native Host)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$RootDir = (Get-Item $PSScriptRoot).Parent.Parent.FullName
Set-Location $RootDir

# 1. Start Governor in background process
Write-Host "⚙️ Starting Zero-Trust Policy Governor on port 8000..." -ForegroundColor Yellow
$GovJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir'; uvicorn governor.main:app --host 127.0.0.1 --port 8000" -PassThru

Start-Sleep -Seconds 3

# 2. Start MCP Web Server & IDE Gateway
Write-Host "⚙️ Starting MCP IDE Gateway on port 3000..." -ForegroundColor Yellow
$McpJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir\mcp-server'; node dist/web-server.js" -PassThru

Start-Sleep -Seconds 3

Write-Host "`n✅ Both services initiated successfully!" -ForegroundColor Green
Write-Host "   - Monaco IDE:        http://localhost:3000/ide" -ForegroundColor White
Write-Host "   - Policy Governor:   http://localhost:8000" -ForegroundColor White
Write-Host "   - API Documentation: http://localhost:8000/docs" -ForegroundColor White
