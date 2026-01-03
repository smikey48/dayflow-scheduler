#!/usr/bin/env python3
"""Check Fix Rob's Door task"""

from supabase import create_client
import os
from datetime import date

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_KEY')

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
    print("Missing credentials")
    exit(1)

supabase = create_client(url, key)
user_id = '3c877140-9539-47b9-898a-45eeab392e39'
today = date.today().isoformat()

print("=== FIX ROB'S DOOR - INVESTIGATION ===\n")

# 1. Find the template
print("1. TEMPLATE:")
result = supabase.table('task_templates').select('*').eq('user_id', user_id).ilike('title', "%Rob's Door%").execute()
if result.data:
    t = result.data[0]
    print(f"   ID: {t['id']}")
    print(f"   Title: {t['title']}")
    print(f"   repeat_unit: {t.get('repeat_unit')}")
    print(f"   date: {t.get('date')}")
    template_id = t['id']
else:
    print("   Not found in templates")
    template_id = None

if template_id:
    # 2. Check all scheduled instances
    print("\n2. ALL SCHEDULED INSTANCES:")
    result = supabase.table('scheduled_tasks').select('local_date, is_completed, is_deleted, start_time').eq('user_id', user_id).eq('template_id', template_id).order('local_date', desc=True).limit(10).execute()
    if result.data:
        for t in result.data:
            status = []
            if t.get('is_completed'): status.append('COMPLETED')
            if t.get('is_deleted'): status.append('DELETED')
            if not status: status.append('ACTIVE')
            print(f"   {t['local_date']}: {', '.join(status)} at {t.get('start_time')}")
    else:
        print("   No scheduled instances found")
    
    # 3. Check archived instances
    print("\n3. ARCHIVED INSTANCES:")
    result = supabase.table('scheduled_tasks_archive').select('local_date, is_completed, is_deleted').eq('user_id', user_id).eq('template_id', template_id).order('local_date', desc=True).limit(5).execute()
    if result.data:
        for t in result.data:
            status = []
            if t.get('is_completed'): status.append('COMPLETED')
            if t.get('is_deleted'): status.append('DELETED')
            print(f"   {t['local_date']}: {', '.join(status)}")
    else:
        print("   No archived instances")

# 4. Today's entry
print("\n4. TODAY'S SCHEDULE ENTRY:")
result = supabase.table('scheduled_tasks').select('*').eq('user_id', user_id).eq('local_date', today).ilike('title', "%Rob's Door%").execute()
if result.data:
    t = result.data[0]
    print(f"   Template ID: {t.get('template_id')}")
    print(f"   Start: {t.get('start_time')}")
    print(f"   End: {t.get('end_time')}")
    print(f"   is_completed: {t.get('is_completed')}")
    print(f"   is_deleted: {t.get('is_deleted')}")
else:
    print("   Not found in today's schedule")
