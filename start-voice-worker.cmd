@echo off
REM Start the voice worker using PM2
cd /d "%~dp0"
pm2 resurrect
pm2 logs voice-worker
