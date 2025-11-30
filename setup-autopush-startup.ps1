# Run this script once to set up auto-push to start automatically on login

$ErrorActionPreference = "Stop"

$scriptPath = "C:\Projects\dayflow-ui\dayflow2-gui\auto-push.ps1"
$workingDir = "C:\Projects\dayflow-ui\dayflow2-gui"

# Check if task already exists and remove it
$existingTask = Get-ScheduledTask -TaskName "DayFlow AutoPush" -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Removing existing DayFlow AutoPush task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName "DayFlow AutoPush" -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "pwsh.exe" -Argument "-WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory $workingDir
$trigger = New-ScheduledTaskTrigger -AtLogon
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

# Register the task
$task = Register-ScheduledTask -TaskName "DayFlow AutoPush" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Automatically push DayFlow code changes to GitHub every 30 seconds"

# Set no execution time limit after registration
$task.Settings.ExecutionTimeLimit = "PT0S"
$task | Set-ScheduledTask | Out-Null

Write-Host ""
Write-Host "✓ DayFlow AutoPush has been configured successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Details:" -ForegroundColor Cyan
Write-Host "  - Starts automatically when you log in" -ForegroundColor White
Write-Host "  - Checks for changes every 30 seconds" -ForegroundColor White
Write-Host "  - Runs in the background (hidden window)" -ForegroundColor White
Write-Host ""
Write-Host "To start it now without logging out:" -ForegroundColor Cyan
Write-Host '  Start-ScheduledTask -TaskName "DayFlow AutoPush"' -ForegroundColor Gray
Write-Host ""
Write-Host "To stop it:" -ForegroundColor Cyan
Write-Host '  Stop-ScheduledTask -TaskName "DayFlow AutoPush"' -ForegroundColor Gray
Write-Host ""
Write-Host "To disable automatic startup:" -ForegroundColor Cyan
Write-Host '  Disable-ScheduledTask -TaskName "DayFlow AutoPush"' -ForegroundColor Gray
Write-Host ""
Write-Host "To remove it completely:" -ForegroundColor Cyan
Write-Host '  Unregister-ScheduledTask -TaskName "DayFlow AutoPush"' -ForegroundColor Gray
Write-Host ""
