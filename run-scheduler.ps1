$ErrorActionPreference = "Stop"

# 1) Run from project root so .env files are found
Set-Location -Path "C:\Projects\dayflow-ui\dayflow2-gui"

# 2) (Optional) activate venv if you use one
# . .\venv\Scripts\Activate.ps1

# 3) Your test user id
$USER_ID = "3c877140-9539-47b9-898a-45eeab392e39"

# 4) Log file
$logDir = "C:\Projects\dayflow-ui\dayflow2-gui\logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = Join-Path $logDir ("scheduler-" + (Get-Date -Format "yyyy-MM-dd") + ".log")

# 5) Resolve Python path and capture ALL output to the log (stdout+stderr)
$py = (Get-Command python).Source
& $py -m dayflow.scheduler_main --date today --user $USER_ID --force 2>&1 | Tee-Object -FilePath $logFile
