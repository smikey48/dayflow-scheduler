"""Check template modification history."""
import os
import sys
from pathlib import Path

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

template_id = "209e8601-0b9f-42de-8a50-6406327d06fa"

print("=== coffee/reading TEMPLATE ===\n")
tmpl = sb.table("task_templates").select("*").eq("id", template_id).execute()

if tmpl.data:
    t = tmpl.data[0]
    print(f"Title: {t['title']}")
    print(f"is_appointment: {t.get('is_appointment')} {'← PROBLEM!' if t.get('is_appointment') else '← Correct'}")
    print(f"is_routine: {t.get('is_routine')}")
    print(f"kind: {t.get('kind')}")
    print(f"start_time: {t.get('start_time')}")
    print(f"end_time: {t.get('end_time')}")
    print(f"duration_minutes: {t.get('duration_minutes')}")
    print(f"repeat_unit: {t.get('repeat_unit')}")
    print(f"created_at: {t.get('created_at')}")
    print(f"updated_at: {t.get('updated_at')}")
    print()
    
    if t.get('is_appointment'):
        print("❌ ROOT CAUSE FOUND!")
        print("   The TEMPLATE itself has is_appointment = True")
        print("   This is incorrect for a daily routine task.")
        print()
        print("FIX:")
        print(f"   UPDATE task_templates")
        print(f"   SET is_appointment = FALSE, is_routine = TRUE")
        print(f"   WHERE id = '{template_id}';")
    else:
        print("✅ Template is correct (is_appointment = False)")
        print("   The issue must be in how the UI renders template-based tasks.")
