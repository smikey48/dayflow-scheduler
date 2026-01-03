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

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
sb = create_client(url, key)

# Check ALL Ocado tasks for today
result = sb.table('scheduled_tasks').select('id, title, template_id, origin_template_id, is_deleted, is_completed, start_time').ilike('title', '%ocado%').eq('local_date', '2025-12-24').execute()

if result.data:
    import json
    print(f"Found {len(result.data)} Ocado task(s) for 2025-12-24:")
    print(json.dumps(result.data, indent=2))
else:
    print("No Ocado tasks found for 2025-12-24")
