import os
from supabase import create_client
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

# Initialize Supabase client
SUPABASE_URL = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Supabase credentials not found")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

USER_ID = '3c877140-9539-47b9-898a-45eeab392e39'

print("=== Analyzing 'Book a hair cut' tasks ===\n")

# Try different search patterns
search_patterns = ['hair cut', 'haircut', 'hair', 'Book a hair']

for pattern in search_patterns:
    response = supabase.table('scheduled_tasks').select('*').eq('user_id', USER_ID).ilike('title', f'%{pattern}%').execute()
    print(f"Search for '{pattern}': {len(response.data)} tasks")

print("\n=== Getting ALL tasks to analyze ===")
# Get all tasks
response = supabase.table('scheduled_tasks').select('*').eq('user_id', USER_ID).execute()
all_tasks = response.data
print(f"Total tasks: {len(all_tasks)}\n")

# Count by title
title_counts = {}
for task in all_tasks:
    title = task.get('title', 'No title')
    title_counts[title] = title_counts.get(title, 0) + 1

# Show titles with more than 5 occurrences
print("Titles appearing more than 5 times:")
for title, count in sorted(title_counts.items(), key=lambda x: x[1], reverse=True):
    if count > 5:
        print(f"  {title}: {count} times")

# Now focus on haircut
haircut_tasks = [t for t in all_tasks if 'hair' in t.get('title', '').lower()]
tasks = haircut_tasks
print(f"\nTasks with 'hair' in title: {len(tasks)}\n")

if tasks:
    # Group by status
    by_status = {}
    by_date = {}
    
    for task in tasks:
        status_key = f"deleted={task.get('is_deleted', False)}, completed={task.get('is_completed', False)}"
        by_status[status_key] = by_status.get(status_key, 0) + 1
        
        date = task.get('date') or task.get('local_date', 'No date')
        by_date[date] = by_date.get(date, 0) + 1
    
    print("Breakdown by status:")
    for status, count in sorted(by_status.items()):
        print(f"  {status}: {count}")
    
    print(f"\nUnique dates: {len(by_date)}")
    print("\nDates with counts:")
    for date, count in sorted(by_date.items()):
        print(f"  {date}: {count} tasks")
    
    # Show first few tasks
    print("\nFirst 5 tasks:")
    for i, task in enumerate(tasks[:5]):
        print(f"\n  Task {i+1}:")
        print(f"    ID: {task['id']}")
        print(f"    Date: {task.get('date') or task.get('local_date')}")
        print(f"    Deleted: {task.get('is_deleted', False)}")
        print(f"    Completed: {task.get('is_completed', False)}")
        print(f"    Template ID: {task.get('template_id')}")
        print(f"    Created: {task.get('created_at', 'Unknown')}")
    
    # Check for old tasks
    print("\n=== Old tasks (before 2026-01-04) ===")
    old_count = 0
    for task in tasks:
        task_date = task.get('date') or task.get('local_date')
        if task_date and task_date < '2026-01-04':
            old_count += 1
    
    print(f"Tasks older than 14 days: {old_count}")
    
    if old_count > 0:
        print(f"\nThese {old_count} old tasks should be archived!")
