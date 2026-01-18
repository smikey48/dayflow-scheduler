"""Check when scheduler last ran and what time it is now."""
import os
import sys
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parent))

def _load_env_files_manual():
    candidates = [".env", ".env.local", ".env.dev", ".env.local.dev"]
    cwd = Path.cwd()
    for fname in candidates:
        path = cwd / fname
        if not path.exists():
            continue
        try:
            for raw in path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val
        except Exception as e:
            print(f"Error loading {path}: {e}")

_load_env_files_manual()

from supabase import create_client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
sb = create_client(url, key)

# What time is it now?
now = datetime.now(ZoneInfo("Europe/London"))
print(f"Current time (London): {now.strftime('%Y-%m-%d %H:%M:%S %Z')}")
print()

# When were today's tasks created?
today = now.date().isoformat()
print(f"Checking tasks created today ({today})...")
tasks = sb.table("scheduled_tasks").select("title, created_at, start_time").eq("local_date", today).order("created_at").execute()

if tasks.data:
    earliest = None
    latest = None
    for t in tasks.data:
        created = datetime.fromisoformat(t['created_at'].replace('Z', '+00:00'))
        created_local = created.astimezone(ZoneInfo("Europe/London"))
        if earliest is None or created_local < earliest:
            earliest = created_local
        if latest is None or created_local > latest:
            latest = created_local
    
    print(f"First task created at: {earliest.strftime('%H:%M:%S')}")
    print(f"Last task created at:  {latest.strftime('%H:%M:%S')}")
    print()
    
    # Show BP measurement specifically
    bp_tasks = [t for t in tasks.data if 'BP' in t['title']]
    for bp in bp_tasks:
        created = datetime.fromisoformat(bp['created_at'].replace('Z', '+00:00'))
        created_local = created.astimezone(ZoneInfo("Europe/London"))
        print(f"'{bp['title']}' created at {created_local.strftime('%H:%M:%S')}, scheduled for: {bp.get('start_time', 'NOT SCHEDULED')}")
    
    print()
    print("ANALYSIS:")
    bp_window_end = now.replace(hour=12, minute=0, second=0, microsecond=0)
    if earliest > bp_window_end:
        print(f"❌ PROBLEM: Scheduler ran at {earliest.strftime('%H:%M:%S')}, AFTER the BP window closed at 12:00")
        print("   The scheduler must run EARLIER in the day to schedule tasks with morning windows.")
    elif earliest.hour >= 8:
        print(f"✅ Scheduler ran at {earliest.strftime('%H:%M:%S')}, within the 08:00-12:00 window")
        print("   The task should have been schedulable. Checking why it wasn't scheduled...")
        
        # Check what tasks were scheduled during the 08:00-12:00 window
        morning_tasks = [t for t in tasks.data if t.get('start_time')]
        morning_tasks_in_window = []
        for t in morning_tasks:
            st = datetime.fromisoformat(t['start_time'].replace('Z', '+00:00'))
            st_local = st.astimezone(ZoneInfo("Europe/London"))
            if 8 <= st_local.hour < 12:
                morning_tasks_in_window.append((t['title'], st_local.strftime('%H:%M')))
        
        print(f"\n   Tasks scheduled in 08:00-12:00 window:")
        for title, time in morning_tasks_in_window:
            print(f"     {time} - {title}")
    else:
        print(f"⚠️  Scheduler ran at {earliest.strftime('%H:%M:%S')}, BEFORE the 08:00 window started")
        print("   BP measurement window: 08:00-12:00")
else:
    print("No tasks found for today!")
