# Run this script once to set up the DayFlow scheduler to run automatically at 7 AM daily

$ErrorActionPreference = "Stop"

# Configuration
$scriptPath = "C:\Projects\dayflow-ui\dayflow2-gui\run-scheduler.ps1"
$workingDir = "C:\Projects\dayflow-ui\dayflow2-gui"

# Verify the script exists
if (-not (Test-Path $scriptPath)) {
    Write-Host "Error: Script not found at $scriptPath" -ForegroundColor Red
    exit 1
}

# Create the scheduled task action
$action = New-ScheduledTaskAction `
    -Execute "pwsh.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" `
    -WorkingDirectory $workingDir

# Create the daily trigger at 7:00 AM
$trigger = New-ScheduledTaskTrigger -Daily -At "07:00"

# Create the principal (run as current user when logged on)
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERNAME" `
    -LogonType Interactive

# Create the settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

# Check if task already exists and remove it
$existingTask = Get-ScheduledTask -TaskName "DayFlow Daily Scheduler" -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Removing existing DayFlow Daily Scheduler task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName "DayFlow Daily Scheduler" -Confirm:$false
}

# Register the scheduled task
Register-ScheduledTask `
    -TaskName "DayFlow Daily Scheduler" `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Automatically run DayFlow scheduler at 7 AM daily to generate the day's schedule"

Write-Host ""
Write-Host "✓ DayFlow Daily Scheduler has been configured successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Details:" -ForegroundColor Cyan
Write-Host "  - Runs daily at 7:00 AM" -ForegroundColor White
Write-Host "  - Will run even if you're not logged in" -ForegroundColor White
Write-Host "  - Logs saved to: C:\Projects\dayflow-scheduler\logs\" -ForegroundColor White
Write-Host ""
Write-Host "To verify the task:" -ForegroundColor Cyan
Write-Host '  Get-ScheduledTask -TaskName "DayFlow Daily Scheduler" | Get-ScheduledTaskInfo' -ForegroundColor Gray
Write-Host ""
Write-Host "To disable the task:" -ForegroundColor Cyan
Write-Host '  Disable-ScheduledTask -TaskName "DayFlow Daily Scheduler"' -ForegroundColor Gray
Write-Host ""
Write-Host "To remove the task:" -ForegroundColor Cyan
Write-Host '  Unregister-ScheduledTask -TaskName "DayFlow Daily Scheduler"' -ForegroundColor Gray
Write-Host ""
