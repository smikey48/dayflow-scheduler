#!/usr/bin/env python3
"""Check why Fix washing machine leak is not scheduled today"""

from supabase import create_client
import os

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_KEY')

# Try reading from .env.local if not in environment
if not url or not key:
    try:
        with open('.env.local', 'r') as f:
            for line in f:
                if line.startswith('SUPABASE_URL='):
                    url = line.split('=', 1)[1].strip()
                elif line.startswith('SUPABASE_SERVICE_KEY='):
                    key = line.split('=', 1)[1].strip()
    except Exception as e:
        print(f"Error reading .env.local: {e}")

if not url or not key:
    print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    exit(1)

supabase = create_client(url, key)
user_id = '3c877140-9539-47b9-898a-45eeab392e39'

# Check if it was already scheduled on a different day
print("=== CHECK IF ALREADY USED ===")
template_id = '068ff515-1551-43f5-acbd-1051a8c84ad5'

# Check scheduled_tasks
result = supabase.table('scheduled_tasks').select('local_date, title').eq('user_id', user_id).eq('template_id', template_id).execute()
if result.data:
    print(f"Found {len(result.data)} scheduled_tasks entries:")
    for task in result.data:
        print(f"  - {task['local_date']}: {task['title']}")
else:
    print("Not found in scheduled_tasks")

# Check scheduled_tasks_archive
result = supabase.table('scheduled_tasks_archive').select('local_date, title').eq('user_id', user_id).eq('template_id', template_id).execute()
if result.data:
    print(f"\nFound {len(result.data)} scheduled_tasks_archive entries:")
    for task in result.data:
        print(f"  - {task['local_date']}: {task['title']}")
else:
    print("Not found in scheduled_tasks_archive")

print("\n=== CHECK TODAY'S SCHEDULED TASKS ===")
from datetime import date
today = date.today().isoformat()
result = supabase.table('scheduled_tasks').select('title, is_appointment, start_time, end_time').eq('user_id', user_id).eq('local_date', today).execute()
if result.data:
    print(f"Found {len(result.data)} tasks scheduled for {today}:")
    for task in result.data:
        appt = " [APPOINTMENT]" if task.get('is_appointment') else ""
        print(f"  - {task['title']}{appt}: {task.get('start_time')} - {task.get('end_time')}")
else:
    print(f"No tasks scheduled for {today}")
