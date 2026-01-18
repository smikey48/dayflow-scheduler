"""Check coffee/reading scheduled_tasks entry flags."""
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

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
sb = create_client(url, key)

today = date.today().isoformat()
template_id = "209e8601-0b9f-42de-8a50-6406327d06fa"  # coffee/reading

print("=== coffee/reading scheduled_tasks entry ===\n")

tasks = sb.table("scheduled_tasks").select("*").eq("local_date", today).eq("template_id", template_id).execute()

if tasks.data:
    task = tasks.data[0]
    print(f"Title: {task['title']}")
    print(f"ID: {task['id']}")
    print(f"is_appointment: {task.get('is_appointment')} {'← CAUSING RED COLOR!' if task.get('is_appointment') else ''}")
    print(f"is_routine: {task.get('is_routine')}")
    print(f"is_fixed: {task.get('is_fixed')}")
    print(f"start_time: {task.get('start_time')}")
    print(f"created_at: {task.get('created_at')}")
    print()
    
    if task.get('is_appointment'):
        print("❌ PROBLEM: The scheduled_tasks row has is_appointment = True")
        print("   This was created by the scheduler with wrong flags.")
        print()
        print("FIX:")
        print(f"   UPDATE scheduled_tasks")
        print(f"   SET is_appointment = FALSE, is_routine = TRUE")
        print(f"   WHERE id = '{task['id']}';")
    elif not task.get('is_routine'):
        print("⚠️  is_appointment is False but is_routine is also False")
        print("   This should be a routine task.")
        print()
        print("FIX:")
        print(f"   UPDATE scheduled_tasks SET is_routine = TRUE WHERE id = '{task['id']}';")
else:
    print("No coffee/reading scheduled_tasks entry found for today")
