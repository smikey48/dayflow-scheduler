@echo off
setlocal

REM 1) Go to the project root so .env files are found
cd /d C:\Projects\dayflow-scheduler

REM 2) Your user id
set "USER_ID=3c877140-9539-47b9-898a-45eeab392e39"

REM 3) Ensure logs folder
if not exist "logs" mkdir "logs"

REM 4) Resolve python path (first match on PATH)
for /f "delims=" %%P in ('where python') do (
  set "PY=%%P"
  goto :py_found
)
echo [%date% %time%] ERROR: python not found on PATH >> "logs\scheduler.log"
exit /b 1

:py_found
REM 5) Run the scheduler and append ALL output to a single log file
REM    Use --force today; you can remove --force after you confirm the 07:00 gate works via Task Scheduler.
"%PY%" -m dayflow.scheduler_main --date today --user %USER_ID%  >> "logs\scheduler.log" 2>&1


echo [%date% %time%] DONE >> "logs\scheduler.log"
endlocal
