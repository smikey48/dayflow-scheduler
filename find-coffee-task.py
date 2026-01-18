"""Find all coffee/reading tasks for today by title search."""
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

print(f"=== All tasks containing 'coffee' OR 'reading' for {today} ===\n")

# Search by title pattern
coffee_tasks = sb.table("scheduled_tasks").select("*").eq("local_date", today).or_("title.ilike.%coffee%,title.ilike.%reading%").execute()

if coffee_tasks.data:
    for t in coffee_tasks.data:
        print(f"TASK: {t['title']}")
        print(f"  ID: {t['id']}")
        print(f"  Template ID: {t.get('template_id')}")
        print(f"  is_appointment: {t.get('is_appointment')} {'← RED COLOR' if t.get('is_appointment') else ''}")
        print(f"  is_routine: {t.get('is_routine')}")
        print(f"  is_fixed: {t.get('is_fixed')}")
        print(f"  start_time: {t.get('start_time')}")
        print(f"  is_deleted: {t.get('is_deleted')}")
        print(f"  is_completed: {t.get('is_completed')}")
        print()
else:
    print("No tasks found containing 'coffee' or 'reading'")
