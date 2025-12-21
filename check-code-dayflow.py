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
print(f"Checking 'code dayflow' tasks for {today}...")

# Check scheduled_tasks for "code dayflow"
result = sb.table('scheduled_tasks')\
    .select('*')\
    .eq('user_id', USER_ID)\
    .eq('local_date', today)\
    .ilike('title', '%code%dayflow%')\
    .execute()

if result.data:
    print(f"\nFound {len(result.data)} task(s) matching 'code dayflow':")
    for task in result.data:
        print(f"\nTitle: {task.get('title')}")
        print(f"Start time: {task.get('start_time')}")
        print(f"End time: {task.get('end_time')}")
        print(f"Duration: {task.get('duration_minutes')} minutes")
        print(f"Description (notes): {task.get('description')}")
        print(f"Template ID: {task.get('template_id')}")
        print(f"Is completed: {task.get('is_completed')}")
        print(f"Is deleted: {task.get('is_deleted')}")
        print(f"Task ID: {task.get('id')}")
        print("-" * 60)
else:
    print("No 'code dayflow' task found in scheduled_tasks.")

# Check archive
print("\n=== Checking archive ===")
archive_result = sb.table('scheduled_tasks_archive')\
    .select('*')\
    .eq('user_id', USER_ID)\
    .eq('local_date', today)\
    .ilike('title', '%code%dayflow%')\
    .order('archived_at', desc=True)\
    .execute()

if archive_result.data:
    print(f"Found {len(archive_result.data)} archived task(s):")
    for task in archive_result.data:
        print(f"\nTitle: {task.get('title')}")
        print(f"Description: {task.get('description')}")
        print(f"Archived at: {task.get('archived_at')}")
        print("-" * 60)
else:
    print("No archived tasks found.")
