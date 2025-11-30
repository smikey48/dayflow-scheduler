# Simple startup script to launch auto-push in the background
# Place this in your Windows Startup folder to run automatically on login
#
# To install:
# 1. Press Win+R, type: shell:startup
# 2. Create a shortcut to this script in the startup folder
#
# Or run this script to create the shortcut automatically:
# .\install-autopush-startup.ps1

$scriptPath = "C:\Projects\dayflow-ui\dayflow2-gui\auto-push.ps1"
$workingDir = "C:\Projects\dayflow-ui\dayflow2-gui"

# Check if auto-push is already running
$existingProcess = Get-Process pwsh -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -and (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine -like "*auto-push.ps1*"
}

if ($existingProcess) {
    Write-Host "Auto-push is already running (PID: $($existingProcess.Id))" -ForegroundColor Yellow
    exit 0
}

# Start auto-push in hidden window
Write-Host "Starting DayFlow auto-push..." -ForegroundColor Green
Start-Process pwsh -ArgumentList "-WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory $workingDir

Write-Host "Auto-push started successfully!" -ForegroundColor Green
Write-Host "Checking for changes every 30 seconds..." -ForegroundColor Cyan
