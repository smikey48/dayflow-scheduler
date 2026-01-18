"""List ALL tasks for today to find which one is red."""
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

print(f"=== ALL tasks for {today} (sorted by start_time) ===\n")

all_tasks = sb.table("scheduled_tasks").select("title, is_appointment, is_routine, is_fixed, start_time, is_deleted, is_completed, template_id").eq("local_date", today).order("start_time").execute()

appointments = []
routines = []
other = []

for t in all_tasks.data:
    if t.get('is_deleted') or t.get('is_completed'):
        continue
    if t.get('is_appointment'):
        appointments.append(t)
    elif t.get('is_routine'):
        routines.append(t)
    else:
        other.append(t)

if appointments:
    print(f"🔴 APPOINTMENTS (shown in RED):")
    for t in appointments:
        print(f"  - {t['title']} at {t.get('start_time', 'NO TIME')}")
    print()

if routines:
    print(f"⚫ ROUTINES (shown in BLACK):")
    for t in routines:
        print(f"  - {t['title']} at {t.get('start_time', 'NO TIME')}")
    print()

if other:
    print(f"⚫ OTHER (shown in BLACK):")
    for t in other:
        print(f"  - {t['title']} at {t.get('start_time', 'NO TIME')} (appointment={t.get('is_appointment')}, routine={t.get('is_routine')})")
    print()

print(f"\nTotal: {len(appointments)} appointments, {len(routines)} routines, {len(other)} other")
