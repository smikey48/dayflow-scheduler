# Quick Voice Note Feature

## Overview
Record a voice note on your phone that automatically becomes a 5-minute, priority 1 task in your DayFlow schedule.

## How It Works

1. **Record** - Open `/quick-note` on your phone and tap the microphone button
2. **Transcribe** - The voice worker automatically transcribes your audio using OpenAI Whisper
3. **Parse** - GPT-4 extracts the task details from your transcript
4. **Schedule** - Your Python scheduler picks up the new template and schedules it

## Setup

### 1. Ensure Voice Worker is Running
The voice worker must be running to process recordings:

```powershell
# Start the voice worker
.\start-voice-worker.ps1
```

Or set it up to run automatically on startup (check `VOICE_WORKER_SETUP.md`).

### 2. Make DayFlow Accessible from Your Phone

You have several options:

#### Option A: Same WiFi Network (Local Access)

**Best for:** Testing, home use only

1. Find your PC's IP address:
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike '*Loopback*'} | Select-Object IPAddress
```

2. On your phone (connected to same WiFi):
   - Open browser
   - Go to `http://YOUR-PC-IP:3000/quick-note` (e.g., `http://192.168.1.100:3000/quick-note`)

#### Option B: Cloudflare Tunnel (Recommended)

**Best for:** Access from anywhere, secure, free

1. Run the setup script:
```powershell
.\setup-cloudflare-tunnel.ps1
```

2. Follow the on-screen instructions to configure your public URL

3. Start the tunnel:
```powershell
.\start-cloudflare-tunnel.ps1
```

4. Access from anywhere at your configured URL (e.g., `https://dayflow.yourusername.workers.dev/quick-note`)

**Benefits:**
- ✅ Access from anywhere (cellular, any WiFi)
- ✅ HTTPS (required for microphone on some browsers)
- ✅ No port forwarding needed
- ✅ Free tier available
- ✅ Secure authentication options

#### Option C: ngrok (Quick Alternative)

**Best for:** Quick testing, temporary access

1. Install ngrok: `winget install ngrok.ngrok`
2. Run: `ngrok http 3000`
3. Use the provided URL (e.g., `https://abc123.ngrok.io/quick-note`)

**Note:** Free tier URLs change each time you restart ngrok.

### 3. Access on Mobile

Once exposed via Cloudflare Tunnel or ngrok, navigate to your public URL.

**For easy mobile access:**
- Add to your phone's home screen (iOS: Share → Add to Home Screen)
- This creates a mobile app-like experience
- Works offline after initial load (if you enable PWA features)

### 3. Record Your Note

1. Tap the red microphone button
2. Grant microphone permissions if prompted
3. Speak your task (e.g., "Call John about the project proposal")
4. Tap the stop button (gray square) when done
5. Wait 1-2 minutes for processing

### 4. Check Your Schedule

Navigate to the "Today" page - your task should appear as:
- **Duration**: 5 minutes (fixed)
- **Priority**: 1 (highest - scheduled first)
- **Type**: Floating task (scheduled flexibly by the system)

## Technical Details

### Files Modified/Created

- **New**: `app/quick-note/page.tsx` - Mobile-friendly recording interface
- **Modified**: `scripts/voice-worker.mjs` - Added metadata override support
- **Modified**: `app/api/voice-task/route.ts` - Added duration/priority override handling

### Database Tables Used

1. **voice_jobs** - Tracks the recording and processing status
   - Stores metadata overrides: `{ duration_override: 5, priority_override: 1 }`
2. **task_templates** - The created task template
3. **scheduled_tasks** - The Python scheduler creates the actual scheduled instance

### Processing Flow

```
Phone Recording
    ↓
Supabase Storage (voice bucket)
    ↓
voice_jobs table (with metadata)
    ↓
Voice Worker (transcription)
    ↓
/api/voice-task (parsing with overrides)
    ↓
task_templates table
    ↓
Python Scheduler (next run or manual trigger)
    ↓
scheduled_tasks table (appears in Today view)
```

## Customization

To change the default duration or priority, edit `app/quick-note/page.tsx`:

```typescript
metadata: {
  source: 'quick-note',
  duration_override: 10,  // Change to 10 minutes
  priority_override: 2,    // Change to priority 2
}
```

## Troubleshooting

### "Not authenticated" error
- Make sure you're logged in to DayFlow
- Check that authentication cookies are working

### Task doesn't appear after 2 minutes
1. Check voice worker is running: `Get-Process -Name node | Where-Object {$_.Path -like '*voice-worker*'}`
2. Check voice_jobs table status: Should show "inserted" status
3. Run scheduler manually: `.\run-scheduler.ps1`
4. Check logs: `logs/scheduler-YYYY-MM-DD.log`

### Audio upload fails
- Check Supabase storage quota
- Verify `voice` bucket exists and is accessible
- Check RLS policies allow authenticated uploads

### Recording doesn't start
- Check browser microphone permissions
- Try HTTPS (required for microphone access on some browsers)
- Test on Chrome/Safari (best WebRTC support)

## Security Notes

- Recordings are stored in Supabase Storage under your user ID
- Only authenticated users can create recordings
- The voice worker uses service role key (server-side only)
- Consider implementing cleanup for old audio files

## Future Enhancements

Possible improvements:
- Add voice note history/playback
- Support editing task details before saving
- Add quick templates ("Call", "Email", "Meeting", etc.)
- Offline support with background sync
- Widget for home screen quick access
