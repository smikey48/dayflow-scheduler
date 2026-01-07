#!/usr/bin/env python3
"""
Audit script to find recently deleted scheduled task instances.
Helps track down what's causing unintended deletions.
"""

import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import datetime, timedelta

# Load environment
load_dotenv('.env.local')

# Initialize Supabase client
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

print("=== Recently Deleted Scheduled Task Instances ===\n")

# Get all deleted instances from the last 7 days
seven_days_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')

result = supabase.table('scheduled_tasks').select(
    'id, local_date, title, template_id, is_completed, created_at, updated_at'
).eq('is_deleted', True).gte('local_date', seven_days_ago).order('updated_at', desc=True).limit(50).execute()

if result.data:
    print(f"Found {len(result.data)} deleted instances in the last 7 days:\n")
    for task in result.data:
        created = datetime.fromisoformat(task['created_at'].replace('Z', '+00:00'))
        updated = datetime.fromisoformat(task['updated_at'].replace('Z', '+00:00'))
        time_diff = updated - created
        
        print(f"📅 {task['local_date']}: {task['title']}")
        print(f"   Template: {task['template_id']}")
        print(f"   Created:  {task['created_at']}")
        print(f"   Updated:  {task['updated_at']}")
        print(f"   Deleted after: {time_diff}")
        print(f"   Completed: {task.get('is_completed', False)}")
        print()
else:
    print("No deleted instances found in the last 7 days")

print("\n=== Analysis ===")
print("If you see tasks deleted shortly after creation (< 1 minute), this suggests")
print("an automatic deletion bug rather than manual user deletion.")
print("\nIf time_diff is several hours, it's more likely a manual deletion.")
