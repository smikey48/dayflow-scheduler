"""
Apply the schema fix for scheduled_tasks_archive and test archiving.

This script:
1. Fixes the 'date' column in scheduled_tasks_archive (removes GENERATED constraint)
2. Tests that archiving now works correctly
"""

import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import date, timedelta, datetime

load_dotenv('.env.local')

url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"

print("=== Step 1: Apply Schema Fix ===\n")
print("Run this SQL in your Supabase SQL Editor:")
print()
print("```sql")
print("-- Drop the generated 'date' column")
print("ALTER TABLE scheduled_tasks_archive DROP COLUMN IF EXISTS date;")
print()
print("-- Add 'date' as a regular column")  
print("ALTER TABLE scheduled_tasks_archive ADD COLUMN date DATE;")
print("```")
print()

input("Press Enter after running the SQL migration above...")

print("\n=== Step 2: Test Archiving ===\n")

# Get one old completed task to test
test_task = supabase.table('scheduled_tasks') \
    .select('*') \
    .eq('user_id', user_id) \
    .eq('is_completed', True) \
    .lt('local_date', (date.today() - timedelta(days=14)).isoformat()) \
    .limit(1) \
    .execute()

if not test_task.data:
    print("No old completed tasks found to test with")
    exit(0)

task = test_task.data[0]
print(f"Testing with task: {task['title']} from {task['local_date']}")

# Try to archive it
task_copy = task.copy()
task_copy['archived_at'] = datetime.utcnow().isoformat()

try:
    result = supabase.table('scheduled_tasks_archive').insert(task_copy).execute()
    print("✅ SUCCESS: Task archived successfully!")
    print(f"   Archived task ID: {result.data[0]['id']}")
    
    # Clean up the test
    supabase.table('scheduled_tasks_archive').delete().eq('id', result.data[0]['id']).execute()
    print("   (Test record cleaned up)")
    
    print("\n=== Step 3: Ready for Production ===")
    print("The archive table schema is now fixed.")
    print("Run the archiving script with:")
    print("  python archive-old-tasks.py --execute")
    
except Exception as e:
    print(f"❌ FAILED: {e}")
    print("\nThe schema fix may not have been applied correctly.")
    print("Please check the SQL migration was successful.")
