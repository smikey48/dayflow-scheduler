# Helper script to manage DayFlow auto-push
# Usage: .\manage-autopush.ps1 [status|start|stop|restart]

param(
    [Parameter(Position=0)]
    [ValidateSet("status", "start", "stop", "restart")]
    [string]$Action = "status"
)

function Get-AutoPushProcess {
    Get-Process pwsh -ErrorAction SilentlyContinue | Where-Object {
        $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
        $cmd -like "*auto-push.ps1*"
    }
}

function Show-Status {
    $process = Get-AutoPushProcess
    if ($process) {
        Write-Host "`n✓ Auto-push is RUNNING" -ForegroundColor Green
        Write-Host "  PID: $($process.Id)" -ForegroundColor Cyan
        Write-Host "  Started: $($process.StartTime)" -ForegroundColor Cyan
        Write-Host "  Checking for changes every 30 seconds" -ForegroundColor Gray
    } else {
        Write-Host "`n⚠ Auto-push is NOT running" -ForegroundColor Yellow
    }
    Write-Host ""
}

function Start-AutoPush {
    $process = Get-AutoPushProcess
    if ($process) {
        Write-Host "`n⚠ Auto-push is already running (PID: $($process.Id))" -ForegroundColor Yellow
        Write-Host ""
        return
    }
    
    Write-Host "`nStarting auto-push..." -ForegroundColor Cyan
    Start-Process pwsh -ArgumentList "-WindowStyle Hidden -File `"$PSScriptRoot\auto-push.ps1`"" -WorkingDirectory $PSScriptRoot
    Start-Sleep -Seconds 1
    
    $process = Get-AutoPushProcess
    if ($process) {
        Write-Host "✓ Auto-push started successfully (PID: $($process.Id))" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to start auto-push" -ForegroundColor Red
    }
    Write-Host ""
}

function Stop-AutoPush {
    $process = Get-AutoPushProcess
    if (-not $process) {
        Write-Host "`n⚠ Auto-push is not running" -ForegroundColor Yellow
        Write-Host ""
        return
    }
    
    Write-Host "`nStopping auto-push (PID: $($process.Id))..." -ForegroundColor Cyan
    $process | Stop-Process -Force
    Start-Sleep -Seconds 1
    
    $process = Get-AutoPushProcess
    if (-not $process) {
        Write-Host "✓ Auto-push stopped successfully" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to stop auto-push" -ForegroundColor Red
    }
    Write-Host ""
}

# Execute action
switch ($Action) {
    "status" { Show-Status }
    "start" { Start-AutoPush; Show-Status }
    "stop" { Stop-AutoPush; Show-Status }
    "restart" { Stop-AutoPush; Start-Sleep -Seconds 1; Start-AutoPush; Show-Status }
}
