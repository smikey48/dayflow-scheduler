# run-scheduler.ps1
# Purpose: run the DayFlow scheduler from the correct working directory so .env files load.

@'
$ErrorActionPreference = "Stop"

# 1) Run from project root so .env files are found
Set-Location -Path "C:\Projects\dayflow-scheduler"

# 2) (Optional) activate venv if you use one
# . .\venv\Scripts\Activate.ps1

# 3) Your user id
$USER_ID = "3c877140-9539-47b9-898a-45eeab392e39"

# 4) Log files (stdout + stderr)
$logDir = "C:\Projects\dayflow-scheduler\logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logBase = "scheduler-" + (Get-Date -Format "yyyy-MM-dd")
$stdoutFile = Join-Path $logDir ($logBase + ".out.log")
$stderrFile = Join-Path $logDir ($logBase + ".err.log")
$logFile    = Join-Path $logDir ($logBase + ".log")

# 5) Resolve Python path
$py = (Get-Command python).Source

# 6) Build args (add --force if you run before 07:00 UK)
$args = @("-m","dayflow.scheduler_main","--date","today","--user",$USER_ID)

# 7) Run and redirect both streams
Start-Process -FilePath $py -ArgumentList $args -NoNewWindow `
  -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -Wait

# 8) Combine into a single daily log (stdout first, then stderr)
"" | Set-Content $logFile
Get-Content $stdoutFile | Add-Content $logFile
"`r`n---- STDERR ----`r`n" | Add-Content $logFile
Get-Content $stderrFile | Add-Content $logFile
'@ | Out-File -FilePath "C:\Projects\dayflow-scheduler\run-scheduler.ps1" -Encoding UTF8 -Force



