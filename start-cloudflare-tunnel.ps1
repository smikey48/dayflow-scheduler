# Start Cloudflare Tunnel for DayFlow

$ErrorActionPreference = "Stop"

$cloudflaredPath = "C:\Program Files\cloudflared\cloudflared.exe"

if (-not (Test-Path $cloudflaredPath)) {
    Write-Host "Error: Cloudflared not installed. Run setup-cloudflare-tunnel.ps1 first." -ForegroundColor Red
    exit 1
}

$tunnelName = "dayflow"

Write-Host "Starting Cloudflare Tunnel: $tunnelName" -ForegroundColor Cyan
Write-Host "Your DayFlow instance will be accessible from anywhere!" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop the tunnel" -ForegroundColor Yellow
Write-Host ""

& $cloudflaredPath tunnel run $tunnelName
