# Run this script once to set up auto-push to start automatically on login

$scriptPath = "C:\Projects\dayflow-ui\dayflow2-gui\auto-push.ps1"
$workingDir = "C:\Projects\dayflow-ui\dayflow2-gui"

$action = New-ScheduledTaskAction -Execute "pwsh.exe" -Argument "-NoExit -File `"$scriptPath`"" -WorkingDirectory $workingDir
$trigger = New-ScheduledTaskTrigger -AtLogon
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "DayFlow AutoPush" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Automatically push DayFlow code changes to GitHub"

Write-Host "AutoPush will now start automatically when you log in" -ForegroundColor Green
Write-Host "To disable: Open Task Scheduler and disable DayFlow AutoPush task" -ForegroundColor Yellow
