"""Debug why BP measurement task isn't being scheduled."""
import os
import sys
from pathlib import Path
from datetime import date

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

# Initialize Supabase
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not url or not key:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

sb = create_client(url, key)

today = date.today().isoformat()

print(f"=== Checking BP measurement task for {today} ===\n")

# 1. Check if template exists
print("1. Looking for BP measurement template...")
templates = sb.table("task_templates").select("*").ilike("title", "%BP%").execute()
if templates.data:
    for t in templates.data:
        print(f"   Found template: {t['title']}")
        print(f"   - ID: {t['id']}")
        print(f"   - Priority: {t.get('priority')}")
        print(f"   - Duration: {t.get('duration_minutes')} min")
        print(f"   - Window: {t.get('window_start_local')} - {t.get('window_end_local')}")
        print(f"   - Repeat: {t.get('repeat_unit')}")
        print(f"   - Is deleted: {t.get('is_deleted')}")
        print(f"   - Defer date: {t.get('date')}")
        print()
else:
    print("   ⚠️ No BP measurement template found!\n")

# 2. Check scheduled_tasks for today
print(f"2. Looking for BP measurement in scheduled_tasks for {today}...")
scheduled = sb.table("scheduled_tasks").select("*").eq("local_date", today).ilike("title", "%BP%").execute()
if scheduled.data:
    for s in scheduled.data:
        print(f"   Found scheduled task: {s['title']}")
        print(f"   - ID: {s['id']}")
        print(f"   - Template ID: {s.get('template_id')}")
        print(f"   - Start time: {s.get('start_time')}")
        print(f"   - End time: {s.get('end_time')}")
        print(f"   - Priority: {s.get('priority')}")
        print(f"   - Is scheduled: {s.get('is_scheduled')}")
        print(f"   - Is deleted: {s.get('is_deleted')}")
        print(f"   - Is completed: {s.get('is_completed')}")
        print(f"   - Description: {s.get('description')}")
        print()
else:
    print("   ⚠️ No BP measurement task scheduled for today!\n")

# 3. Check for yesterday's BP task that should be carried forward
from datetime import timedelta
yesterday = (date.today() - timedelta(days=1)).isoformat()
print(f"3. Looking for BP measurement in scheduled_tasks for {yesterday}...")
prev = sb.table("scheduled_tasks").select("*").eq("local_date", yesterday).ilike("title", "%BP%").execute()
if prev.data:
    for p in prev.data:
        print(f"   Found previous task: {p['title']}")
        print(f"   - Is completed: {p.get('is_completed')}")
        print(f"   - Is deleted: {p.get('is_deleted')}")
        print(f"   - Start time: {p.get('start_time')}")
        print()
else:
    print("   No BP task found yesterday.\n")

# 4. Check all scheduled tasks for today (count and types)
print(f"4. All scheduled tasks for {today}:")
all_today = sb.table("scheduled_tasks").select("id, title, start_time, is_appointment, is_routine, is_deleted, is_completed, priority, description").eq("local_date", today).order("start_time").execute()
print(f"   Total tasks: {len(all_today.data)}")
print(f"   Scheduled (with start_time): {len([t for t in all_today.data if t.get('start_time')])}")
print(f"   Unscheduled (no start_time): {len([t for t in all_today.data if not t.get('start_time')])}")
print(f"   Deleted: {len([t for t in all_today.data if t.get('is_deleted')])}")
print(f"   Completed: {len([t for t in all_today.data if t.get('is_completed')])}")

# Show unscheduled tasks
unscheduled = [t for t in all_today.data if not t.get('start_time') and not t.get('is_deleted') and not t.get('is_completed')]
if unscheduled:
    print(f"\n   Unscheduled tasks:")
    for t in unscheduled:
        print(f"   - {t['title']} (priority={t.get('priority')}, description={t.get('description')})")

print("\n=== Analysis ===")
if templates.data:
    template = templates.data[0]
    template_id = template['id']
    
    # Check if it should have been created today
    print(f"Template '{template['title']}' (ID: {template_id}):")
    print(f"  - Repeat unit: {template.get('repeat_unit')}")
    print(f"  - Should be created daily: {template.get('repeat_unit') == 'daily'}")
    
    # Check if exists in today's schedule
    today_task = [s for s in (scheduled.data or []) if s.get('template_id') == template_id]
    if today_task:
        task = today_task[0]
        if not task.get('start_time'):
            print(f"  ⚠️ Task exists but has NO start_time!")
            print(f"     Description: {task.get('description')}")
            print(f"  ❌ PROBLEM: Task is unscheduled (window may have passed)")
        else:
            print(f"  ✅ Task is scheduled at {task.get('start_time')}")
    else:
        print(f"  ❌ PROBLEM: Task was NOT created for today")
        print(f"     Check if preprocess_recurring_tasks is running")
