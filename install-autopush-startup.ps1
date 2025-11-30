# Install auto-push to Windows Startup folder
# Run this once to make auto-push start automatically when you log in

$ErrorActionPreference = "Stop"

$startupFolder = [Environment]::GetFolderPath("Startup")
$scriptToRun = "C:\Projects\dayflow-ui\dayflow2-gui\start-autopush.ps1"
$shortcutPath = Join-Path $startupFolder "DayFlow AutoPush.lnk"

Write-Host "Installing DayFlow AutoPush to startup..." -ForegroundColor Cyan

# Create a WScript.Shell object to create the shortcut
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "pwsh.exe"
$Shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptToRun`""
$Shortcut.WorkingDirectory = "C:\Projects\dayflow-ui\dayflow2-gui"
$Shortcut.Description = "DayFlow automatic GitHub push every 30 seconds"
$Shortcut.Save()

Write-Host ""
Write-Host "✓ DayFlow AutoPush installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Details:" -ForegroundColor Cyan
Write-Host "  - Will start automatically when you log in" -ForegroundColor White
Write-Host "  - Checks for changes every 30 seconds" -ForegroundColor White
Write-Host "  - Runs silently in the background" -ForegroundColor White
Write-Host ""
Write-Host "Shortcut location:" -ForegroundColor Cyan
Write-Host "  $shortcutPath" -ForegroundColor Gray
Write-Host ""
Write-Host "To start it now:" -ForegroundColor Cyan
Write-Host "  .\start-autopush.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "To stop it:" -ForegroundColor Cyan
Write-Host '  Get-Process pwsh | Where-Object {(Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine -like "*auto-push.ps1*"} | Stop-Process' -ForegroundColor Gray
Write-Host ""
Write-Host "To uninstall:" -ForegroundColor Cyan
Write-Host "  Remove-Item `"$shortcutPath`"" -ForegroundColor Gray
Write-Host ""
