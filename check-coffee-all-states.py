"""Check for coffee/reading including completed/deleted tasks."""
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
template_id = "209e8601-0b9f-42de-8a50-6406327d06fa"  # coffee/reading template ID

print(f"=== Searching for coffee/reading task (template {template_id}) ===\n")

# Check ALL scheduled tasks for today (no filters)
all_tasks = sb.table("scheduled_tasks").select("*").eq("local_date", today).eq("template_id", template_id).execute()

if all_tasks.data:
    for t in all_tasks.data:
        print(f"FOUND: {t['title']}")
        print(f"  ID: {t['id']}")
        print(f"  is_appointment: {t.get('is_appointment')} {'← CAUSES RED COLOR' if t.get('is_appointment') else ''}")
        print(f"  is_routine: {t.get('is_routine')}")
        print(f"  is_fixed: {t.get('is_fixed')}")
        print(f"  start_time: {t.get('start_time')}")
        print(f"  is_deleted: {t.get('is_deleted')}")
        print(f"  is_completed: {t.get('is_completed')}")
        print(f"  created_at: {t.get('created_at')}")
        print()
        
        if t.get('is_appointment'):
            print("❌ PROBLEM CONFIRMED: is_appointment = True")
            print("   This is why it's showing in RED")
            print()
            print("SOLUTION: Update this task to set is_appointment = False")
            print(f"   UPDATE scheduled_tasks SET is_appointment = FALSE WHERE id = '{t['id']}';")
else:
    print("No coffee/reading task found for today (including completed/deleted)")
    print("\nSearching by title instead...")
    title_search = sb.table("scheduled_tasks").select("*").eq("local_date", today).ilike("title", "%coffee/reading%").execute()
    if title_search.data:
        for t in title_search.data:
            print(f"FOUND: {t['title']}")
            print(f"  is_appointment: {t.get('is_appointment')}")
            print(f"  template_id: {t.get('template_id')}")
    else:
        print("Still not found. The task may be rendered from template directly.")
