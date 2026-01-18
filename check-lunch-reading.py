"""Check Lunch/reading task flags."""
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

print("=== Lunch/reading Investigation ===\n")

# Find template
templates = sb.table("task_templates").select("*").ilike("title", "%Lunch/reading%").execute()

if templates.data:
    tmpl = templates.data[0]
    template_id = tmpl['id']
    
    print("TEMPLATE:")
    print(f"  Title: {tmpl['title']}")
    print(f"  is_appointment: {tmpl.get('is_appointment')} {'← PROBLEM: should be False' if tmpl.get('is_appointment') else '← Correct'}")
    print(f"  is_routine: {tmpl.get('is_routine')} {'← Correct' if tmpl.get('is_routine') else '← PROBLEM: should be True'}")
    print(f"  kind: {tmpl.get('kind')}")
    print(f"  start_time: {tmpl.get('start_time')}")
    print(f"  repeat_unit: {tmpl.get('repeat_unit')}")
    print()
    
    # Find today's scheduled task
    print(f"SCHEDULED TASK (today {today}):")
    tasks = sb.table("scheduled_tasks").select("*").eq("local_date", today).eq("template_id", template_id).execute()
    
    if tasks.data:
        task = tasks.data[0]
        print(f"  Title: {task['title']}")
        print(f"  is_appointment: {task.get('is_appointment')} {'← CAUSES RED COLOR' if task.get('is_appointment') else ''}")
        print(f"  is_routine: {task.get('is_routine')}")
        print(f"  is_fixed: {task.get('is_fixed')}")
        print(f"  start_time: {task.get('start_time')}")
        print(f"  created_at: {task.get('created_at')}")
        print()
        
        print("="*60)
        print("DIAGNOSIS:")
        if tmpl.get('is_appointment') and not tmpl.get('is_routine'):
            print("❌ Template is wrong: marked as appointment instead of routine")
            print(f"   FIX: UPDATE task_templates SET is_appointment = FALSE, is_routine = TRUE WHERE id = '{template_id}';")
        elif task.get('is_appointment') and not task.get('is_routine'):
            print("❌ Scheduled task is wrong: marked as appointment instead of routine")
            print("   The scheduler is copying wrong values from the template")
            print(f"   FIX: UPDATE scheduled_tasks SET is_appointment = FALSE, is_routine = TRUE WHERE id = '{task['id']}';")
        else:
            print("✅ Both template and scheduled task have correct flags")
    else:
        print("  No scheduled task found for today")
else:
    print("No Lunch/reading template found")
