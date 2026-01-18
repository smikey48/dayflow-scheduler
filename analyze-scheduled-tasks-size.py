import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import date, timedelta

load_dotenv('.env.local')

url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"

# Check the size of scheduled_tasks
print("=== Analyzing scheduled_tasks table ===\n")

# Count total tasks
total_result = supabase.table('scheduled_tasks').select('id', count='exact').eq('user_id', user_id).execute()
print(f"Total tasks: {total_result.count}")

# Count by status
completed_result = supabase.table('scheduled_tasks').select('id', count='exact').eq('user_id', user_id).eq('is_completed', True).execute()
deleted_result = supabase.table('scheduled_tasks').select('id', count='exact').eq('user_id', user_id).eq('is_deleted', True).execute()
active_result = supabase.table('scheduled_tasks').select('id', count='exact').eq('user_id', user_id).eq('is_completed', False).eq('is_deleted', False).execute()

print(f"Completed tasks: {completed_result.count}")
print(f"Deleted/skipped tasks: {deleted_result.count}")
print(f"Active (incomplete, not deleted): {active_result.count}")

# Check date range
oldest = supabase.table('scheduled_tasks').select('local_date').eq('user_id', user_id).order('local_date', desc=False).limit(1).execute()
newest = supabase.table('scheduled_tasks').select('local_date').eq('user_id', user_id).order('local_date', desc=True).limit(1).execute()

if oldest.data and newest.data:
    print(f"\nDate range: {oldest.data[0]['local_date']} to {newest.data[0]['local_date']}")

# Count old completed/deleted tasks (older than 14 days)
cutoff_date = (date.today() - timedelta(days=14)).isoformat()
old_completed = supabase.table('scheduled_tasks').select('id', count='exact').eq('user_id', user_id).eq('is_completed', True).lt('local_date', cutoff_date).execute()
old_deleted = supabase.table('scheduled_tasks').select('id', count='exact').eq('user_id', user_id).eq('is_deleted', True).lt('local_date', cutoff_date).execute()

print(f"\n=== Old tasks (older than 14 days) ===")
print(f"Old completed: {old_completed.count}")
print(f"Old deleted/skipped: {old_deleted.count}")
print(f"Total archivable: {old_completed.count + old_deleted.count}")

# Check archive table
archive_result = supabase.table('scheduled_tasks_archive').select('id', count='exact').eq('user_id', user_id).execute()
print(f"\n=== Archive table ===")
print(f"Archived tasks: {archive_result.count}")

print("\n=== Recommendation ===")
archivable = old_completed.count + old_deleted.count
if archivable > 100:
    print(f"✅ You can archive {archivable} old tasks to improve performance")
    print(f"   This will reduce scheduled_tasks from {total_result.count} to {total_result.count - archivable} rows")
else:
    print(f"ℹ️  Only {archivable} tasks are archivable (not a significant performance gain yet)")
