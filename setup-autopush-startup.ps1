# Run this script once to set up auto-push to start automatically on login

$ErrorActionPreference = "Stop"

$scriptPath = "C:\Projects\dayflow-scheduler\auto-push.ps1"
$workingDir = "C:\Projects\dayflow-scheduler"

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
Write-Host "DayFlow AutoPush configured successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Start now: Start-ScheduledTask -TaskName 'DayFlow AutoPush'" -ForegroundColor Cyan
Write-Host "Stop: Stop-ScheduledTask -TaskName 'DayFlow AutoPush'" -ForegroundColor Cyan
Write-Host "Disable: Disable-ScheduledTask -TaskName 'DayFlow AutoPush'" -ForegroundColor Cyan
Write-Host "Remove: Unregister-ScheduledTask -TaskName 'DayFlow AutoPush'" -ForegroundColor Cyan
Write-Host ""
