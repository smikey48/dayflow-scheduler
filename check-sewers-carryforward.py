"""Check the Check sewers task configuration"""
from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv('.env.local')
supabase = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_KEY'))

# Get Check sewers template
result = supabase.table('task_templates').select('*').ilike('title', '%Check sewers%').execute()

if result.data:
    task = result.data[0]
    print('Check sewers template:')
    print(f"  ID: {task['id']}")
    print(f"  repeat_unit: {task.get('repeat_unit')}")
    print(f"  repeat_interval: {task.get('repeat_interval')}")
    print(f"  day_of_month: {task.get('day_of_month')}")
    print(f"  repeat_day: {task.get('repeat_day')}")
    print(f"  is_deleted: {task.get('is_deleted')}")
    
    # Check yesterday's scheduled instance
    print("\nYesterday's instance (2026-01-05):")
    yesterday = supabase.table('scheduled_tasks').select('*').eq('template_id', task['id']).eq('local_date', '2026-01-05').execute()
    if yesterday.data:
        y = yesterday.data[0]
        print(f"  Found: {y['title']}")
        print(f"  is_completed: {y.get('is_completed')}")
        print(f"  is_deleted: {y.get('is_deleted')}")
        print(f"  start_time: {y.get('start_time')}")
    else:
        print("  NOT FOUND")
    
    # Check today's instance
    print("\nToday's instance (2026-01-06):")
    today = supabase.table('scheduled_tasks').select('*').eq('template_id', task['id']).eq('local_date', '2026-01-06').execute()
    if today.data:
        t = today.data[0]
        print(f"  Found: {t['title']}")
        print(f"  is_completed: {t.get('is_completed')}")
        print(f"  is_deleted: {t.get('is_deleted')}")
        print(f"  start_time: {t.get('start_time')}")
    else:
        print("  NOT FOUND - this is the problem!")
else:
    print("Check sewers template NOT FOUND")
