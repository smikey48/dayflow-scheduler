# Voice Worker Auto-Start Setup (Windows)

The voice worker is now running continuously via PM2 and will process voice jobs automatically.

## Current Status

✅ Worker is running: `pm2 status` should show `voice-worker` as `online`
✅ Worker polls every 3 seconds for new jobs
✅ Configuration saved: `pm2 save` has been run

## Quick Commands

```powershell
# View worker status
pm2 status

# View live logs
pm2 logs voice-worker

# Restart worker
pm2 restart voice-worker

# Stop worker
pm2 stop voice-worker

# Start worker (if stopped)
pm2 start voice-worker
```

## Auto-Start on Windows Boot (Option 1: Task Scheduler)

To make the worker start automatically when Windows boots:

1. Open **Task Scheduler** (search in Start menu)
2. Click **Create Task** (not "Create Basic Task")
3. **General tab**:
   - Name: `DayFlow Voice Worker`
   - Check: "Run whether user is logged on or not"
   - Check: "Run with highest privileges"
4. **Triggers tab**:
   - Click "New"
   - Begin the task: "At startup"
   - Click OK
5. **Actions tab**:
   - Click "New"
   - Action: "Start a program"
   - Program/script: `powershell.exe`
   - Add arguments: `-WindowStyle Hidden -File "C:\Projects\dayflow-ui\dayflow2-gui\start-voice-worker.ps1"`
   - Click OK
6. **Conditions tab**:
   - Uncheck "Start the task only if the computer is on AC power"
7. Click OK to save

## Auto-Start on Windows Boot (Option 2: Startup Folder)

Simpler method that runs when you log in:

1. Press `Win + R`, type `shell:startup`, press Enter
2. Right-click in the folder → New → Shortcut
3. Location: `C:\Projects\dayflow-ui\dayflow2-gui\start-voice-worker.cmd`
4. Name: `DayFlow Voice Worker`
5. Click Finish

## Manual Start

If you need to start the worker manually:

```powershell
# Using the PowerShell script
.\start-voice-worker.ps1

# Or using PM2 directly
pm2 resurrect
```

## Monitoring

```powershell
# View real-time logs
pm2 logs voice-worker

# View last 100 lines
pm2 logs voice-worker --lines 100

# Monitor CPU/Memory usage
pm2 monit

# View detailed info
pm2 show voice-worker
```

## Troubleshooting

### Worker not processing jobs
```powershell
# Check if worker is running
pm2 status

# If stopped, restart it
pm2 restart voice-worker

# Check logs for errors
pm2 logs voice-worker --err --lines 50
```

### Worker keeps restarting
```powershell
# Check error logs
pm2 logs voice-worker --err

# Common issues:
# - Missing environment variables (check .env.local)
# - OpenAI API key invalid
# - Supabase credentials incorrect
```

### Reset everything
```powershell
# Stop all PM2 processes
pm2 stop all

# Delete all processes
pm2 delete all

# Start fresh
pm2 start scripts/voice-worker.mjs --name voice-worker
pm2 save
```

## Environment Variables

Make sure `.env.local` contains:
- `OPENAI_API_KEY` - Your OpenAI API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (not anon key)

## Next Steps

Your voice worker is now set up! When you record and upload a voice task:

1. Audio uploads to Supabase Storage
2. Job record created in `voice_jobs` table with status `queued`
3. Worker picks it up within 3 seconds
4. Worker transcribes with Whisper API
5. Worker parses with GPT-4o-mini
6. Worker creates task template
7. Python scheduler generates scheduled tasks (separate process)

The frontend will show progress in real-time via polling! 🎉
