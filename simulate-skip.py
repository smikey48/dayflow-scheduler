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

# Delete the existing Ocado task and create a deleted one
task_id = "eb173a3d-c3a0-4fa3-ac6a-5a733c6c06e1"
template_id = "44c31187-1a50-411a-a0d3-72384517edf1"

# Delete the current one
sb.table('scheduled_tasks').delete().eq('id', task_id).execute()
print(f"Deleted task {task_id}")

# Create a new deleted/skipped task to simulate the skip button
sb.table('scheduled_tasks').insert({
    'template_id': template_id,
    'user_id': '3c877140-9539-47b9-898a-45eeab392e39',
    'title': 'finalise Ocado order',
    'local_date': '2025-12-24',
    'is_deleted': True,
    'is_completed': False,
    'start_time': None,
    'end_time': None,
}).execute()
print("Created deleted task record for 'finalise Ocado order'")
