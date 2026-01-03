#!/usr/bin/env python3
"""Check the status of 'Fix washing machine leak' task"""

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

# Check task_templates for washing machine
print("=== TASK TEMPLATES (washing machine) ===")
result = supabase.table('task_templates').select('*').eq('user_id', user_id).ilike('title', '%washing machine%').execute()
if result.data:
    for task in result.data:
        print(f"\nTemplate ID: {task['id']}")
        print(f"Title: {task['title']}")
        print(f"is_appointment: {task.get('is_appointment', False)}")
        print(f"is_routine: {task.get('is_routine', False)}")
        print(f"is_fixed: {task.get('is_fixed', False)}")
        print(f"start_time: {task.get('start_time')}")
        print(f"duration_minutes: {task.get('duration_minutes')}")
        print(f"window_start_local: {task.get('window_start_local')}")
        print(f"window_end_local: {task.get('window_end_local')}")
        print(f"repeat_unit: {task.get('repeat_unit')}")
        print(f"date: {task.get('date')}")
else:
    print("No template found")

# Check scheduled_tasks for today
print("\n\n=== SCHEDULED TASKS TODAY (washing machine) ===")
from datetime import date
today = date.today().isoformat()
result = supabase.table('scheduled_tasks').select('*').eq('user_id', user_id).eq('local_date', today).ilike('title', '%washing machine%').execute()
if result.data:
    for task in result.data:
        print(f"\nScheduled ID: {task['id']}")
        print(f"Template ID: {task.get('template_id')}")
        print(f"Title: {task['title']}")
        print(f"is_appointment: {task.get('is_appointment', False)}")
        print(f"is_routine: {task.get('is_routine', False)}")
        print(f"is_fixed: {task.get('is_fixed', False)}")
        print(f"start_time: {task.get('start_time')}")
        print(f"end_time: {task.get('end_time')}")
        print(f"is_scheduled: {task.get('is_scheduled')}")
        print(f"is_deleted: {task.get('is_deleted')}")
        print(f"is_completed: {task.get('is_completed')}")
else:
    print("No scheduled task found for today")

# Check all scheduled tasks (any date)
print("\n\n=== ALL SCHEDULED TASKS (washing machine) ===")
result = supabase.table('scheduled_tasks').select('*').eq('user_id', user_id).ilike('title', '%washing machine%').order('local_date', desc=True).limit(5).execute()
if result.data:
    for task in result.data:
        print(f"\nDate: {task.get('local_date')}")
        print(f"Scheduled ID: {task['id']}")
        print(f"Title: {task['title']}")
        print(f"is_appointment: {task.get('is_appointment', False)}")
        print(f"start_time: {task.get('start_time')}")
        print(f"end_time: {task.get('end_time')}")
else:
    print("No scheduled tasks found")
