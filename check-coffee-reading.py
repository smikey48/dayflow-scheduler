"""Check coffee/reading task details."""
import os
import sys
from pathlib import Path
from datetime import date, timedelta

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
yesterday = (date.today() - timedelta(days=1)).isoformat()

print(f"=== Checking coffee/reading task ===\n")

# Check template first
templates = sb.table("task_templates").select("*").ilike("title", "%coffee%").execute()

if templates.data:
    for tmpl in templates.data:
        print(f"TEMPLATE: {tmpl['title']}")
        print(f"  - ID: {tmpl['id']}")
        print(f"  - is_appointment: {tmpl.get('is_appointment')}")
        print(f"  - is_routine: {tmpl.get('is_routine')}")
        print(f"  - kind: {tmpl.get('kind')}")
        print(f"  - start_time: {tmpl.get('start_time')}")
        print(f"  - end_time: {tmpl.get('end_time')}")
        print(f"  - repeat_unit: {tmpl.get('repeat_unit')}")
        print()
        
        template_id = tmpl['id']
        
        # Check today's scheduled task
        print(f"TODAY ({today}):")
        today_tasks = sb.table("scheduled_tasks").select("*").eq("local_date", today).eq("template_id", template_id).execute()
        if today_tasks.data:
            for t in today_tasks.data:
                print(f"  - is_appointment: {t.get('is_appointment')} ⚠️ THIS DETERMINES RED COLOR")
                print(f"  - is_routine: {t.get('is_routine')}")
                print(f"  - is_fixed: {t.get('is_fixed')}")
                print(f"  - start_time: {t.get('start_time')}")
                print(f"  - created_at: {t.get('created_at')}")
        else:
            print(f"  No scheduled task found for today")
        print()
        
        # Check yesterday's task for comparison
        print(f"YESTERDAY ({yesterday}):")
        yesterday_tasks = sb.table("scheduled_tasks").select("*").eq("local_date", yesterday).eq("template_id", template_id).execute()
        if yesterday_tasks.data:
            for t in yesterday_tasks.data:
                print(f"  - is_appointment: {t.get('is_appointment')}")
                print(f"  - is_routine: {t.get('is_routine')}")
                print(f"  - is_fixed: {t.get('is_fixed')}")
                print(f"  - start_time: {t.get('start_time')}")
        else:
            print(f"  No scheduled task found for yesterday")
        print()
        
        print("="*60)
        print("ANALYSIS:")
        if templates.data[0].get('is_appointment'):
            print("❌ PROBLEM: Template has is_appointment = True")
            print("   This should be is_routine = True for a daily routine task")
        elif today_tasks.data and today_tasks.data[0].get('is_appointment'):
            print("❌ PROBLEM: Scheduled task has is_appointment = True")
            print("   But template has is_appointment = False")
            print("   → The scheduler is incorrectly setting is_appointment")
        else:
            print("✅ Both template and scheduled task have correct flags")
else:
    print("No coffee/reading template found")
