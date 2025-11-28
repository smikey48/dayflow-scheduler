# Start Voice Worker with PM2
# This script restores the PM2 process list and ensures the voice worker is running

Write-Host "Starting DayFlow Voice Worker..." -ForegroundColor Cyan

# Navigate to project directory
Set-Location $PSScriptRoot

# Resurrect saved PM2 processes
Write-Host "Restoring PM2 processes..." -ForegroundColor Yellow
pm2 resurrect

# Check status
Write-Host "`nCurrent PM2 Status:" -ForegroundColor Green
pm2 status

Write-Host "`nVoice worker is now running!" -ForegroundColor Green
Write-Host "To view logs: pm2 logs voice-worker" -ForegroundColor Cyan
Write-Host "To stop: pm2 stop voice-worker" -ForegroundColor Cyan
Write-Host "To restart: pm2 restart voice-worker" -ForegroundColor Cyan
