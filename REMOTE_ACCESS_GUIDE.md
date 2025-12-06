# DayFlow Remote Access - Quick Setup Guide

## What You Need Running

For the Quick Voice Note feature to work from your phone:

### 1. Next.js Dev Server (Your PC)
```powershell
npm run dev
```

### 2. Voice Worker (Your PC)
```powershell
.\start-voice-worker.ps1
```

### 3. Remote Access Tunnel (Choose One)

#### Option A: Cloudflare Tunnel (Recommended)

**Setup (one time):**
```powershell
.\setup-cloudflare-tunnel.ps1
```

**Start tunnel:**
```powershell
.\start-cloudflare-tunnel.ps1
```

**Your URL:** `https://dayflow.yourusername.workers.dev`

#### Option B: ngrok (Quick & Temporary)

**Install:**
```powershell
winget install ngrok.ngrok
```

**Start:**
```powershell
ngrok http 3000
```

**Your URL:** Shows in terminal (e.g., `https://abc123.ngrok.io`)

#### Option C: Local Network Only

**Find your IP:**
```powershell
ipconfig | Select-String "IPv4"
```

**Your URL:** `http://YOUR-IP:3000` (e.g., `http://192.168.1.100:3000`)
**Note:** Only works when phone is on same WiFi

## Complete Startup Sequence

Open 3 PowerShell terminals and run:

**Terminal 1:**
```powershell
cd C:\Projects\dayflow-ui\dayflow2-gui
npm run dev
```

**Terminal 2:**
```powershell
cd C:\Projects\dayflow-ui\dayflow2-gui
.\start-voice-worker.ps1
```

**Terminal 3 (if using Cloudflare):**
```powershell
cd C:\Projects\dayflow-ui\dayflow2-gui
.\start-cloudflare-tunnel.ps1
```

## Using from Your Phone

1. Open your browser (Chrome/Safari recommended)
2. Go to your URL + `/quick-note`:
   - Cloudflare: `https://dayflow.yourusername.workers.dev/quick-note`
   - ngrok: `https://abc123.ngrok.io/quick-note`
   - Local: `http://192.168.1.100:3000/quick-note`

3. **Add to Home Screen** (recommended):
   - iOS: Tap Share → Add to Home Screen
   - Android: Menu → Add to Home Screen

4. Grant microphone permission when prompted

5. Tap red button → speak → tap stop → wait 1-2 minutes

6. Task appears in Today view with Priority 1, Duration 5 minutes

## Troubleshooting

### "Can't access from phone"
- Check all 3 services are running (dev server, voice worker, tunnel)
- Verify URL is correct
- Try opening in incognito/private mode
- Check PC firewall isn't blocking connections

### "Microphone not working"
- **HTTPS required**: Use Cloudflare or ngrok (not local IP)
- Grant browser microphone permission
- Try Chrome or Safari (best WebRTC support)
- Check phone's app permissions

### "Task not appearing"
1. Check voice worker logs for errors
2. Check `voice_jobs` table - should show "inserted" status
3. Run scheduler manually: `.\run-scheduler.ps1`
4. Check Today page - refresh if needed

### "Tunnel won't start"
- Cloudflare: Ensure you completed web dashboard setup
- ngrok: Check you're logged in (`ngrok config add-authtoken YOUR_TOKEN`)
- Both: Check no other service is using port 3000

## Security Considerations

### Cloudflare Tunnel
- ✅ Can add authentication (Cloudflare Access)
- ✅ Can restrict by email/IP
- ✅ Encrypted tunnel

### ngrok
- ⚠️ Free URLs are public (anyone with URL can access)
- ✅ Can add basic auth with paid plan
- ✅ URLs change each restart (free tier)

### Local Network
- ✅ Only accessible on your WiFi
- ⚠️ No HTTPS (microphone may not work on all browsers)

**Recommendation:** Use Cloudflare Tunnel with authentication for production use.

## Cost Breakdown

| Method | Cost | Best For |
|--------|------|----------|
| Local Network | Free | Testing at home |
| ngrok Free | Free | Quick testing, temporary |
| ngrok Pro | $8/month | Stable URL, basic auth |
| Cloudflare Tunnel | Free | Production use, recommended |

## Next Steps

After getting remote access working:

1. Set up Cloudflare Tunnel as a Windows Service (runs on startup)
2. Configure authentication (Cloudflare Access)
3. Add custom domain
4. Enable PWA features for offline support
5. Consider auto-starting dev server and voice worker on PC boot
