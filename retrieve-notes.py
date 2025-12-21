from supabase import create_client
import os
from datetime import date

# Initialize Supabase client
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://prloxvewcsxaptzgxvyy.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY', 'sb_secret_ksC74t4wtkeOcdvNtxlVCQ_hkygZocg')
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# Your user ID
USER_ID = '3c877140-9539-47b9-898a-45eeab392e39'

# Today's date
today = str(date.today())
print(f"Searching for notes from {today}...")

# Check scheduled_tasks_archive for tasks with descriptions
print("\n=== Checking scheduled_tasks_archive ===")
archive_result = sb.table('scheduled_tasks_archive')\
    .select('title, description, template_id, local_date, archived_at')\
    .eq('user_id', USER_ID)\
    .eq('local_date', today)\
    .not_.is_('description', 'null')\
    .order('archived_at', desc=True)\
    .execute()

if archive_result.data:
    print(f"Found {len(archive_result.data)} archived task(s) with notes:")
    for task in archive_result.data:
        print(f"\nTitle: {task['title']}")
        print(f"Notes: {task['description']}")
        print(f"Template ID: {task['template_id']}")
        print(f"Archived at: {task['archived_at']}")
        print("-" * 50)
else:
    print("No archived tasks with notes found.")

# Also check if there are any current scheduled_tasks with descriptions
print("\n=== Checking current scheduled_tasks ===")
current_result = sb.table('scheduled_tasks')\
    .select('title, description, template_id, local_date')\
    .eq('user_id', USER_ID)\
    .eq('local_date', today)\
    .not_.is_('description', 'null')\
    .execute()

if current_result.data:
    print(f"Found {len(current_result.data)} current task(s) with notes:")
    for task in current_result.data:
        print(f"\nTitle: {task['title']}")
        print(f"Notes: {task['description']}")
        print(f"Template ID: {task['template_id']}")
        print("-" * 50)
else:
    print("No current tasks with notes found.")

print("\n=== Summary ===")
print(f"If notes were found in the archive, you can restore them by updating the current")
print(f"scheduled_tasks with the template_id and description from the archive.")
