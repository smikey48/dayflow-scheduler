#!/usr/bin/env python3
"""Comprehensive diagnostic for scheduling issues"""

from supabase import create_client
import os
from datetime import date

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
today = date.today().isoformat()

print(f"=== DIAGNOSIS FOR {today} ===\n")

# 1. Check "Fix washing machine leak" template
print("1. FIX WASHING MACHINE LEAK TEMPLATE:")
result = supabase.table('task_templates').select('*').eq('user_id', user_id).eq('id', '068ff515-1551-43f5-acbd-1051a8c84ad5').execute()
if result.data:
    t = result.data[0]
    print(f"   Template exists: {t['title']}")
    print(f"   date field: {t.get('date')}")
    print(f"   repeat_unit: {t.get('repeat_unit')}")
    print(f"   is_appointment: {t.get('is_appointment')}")
    print(f"   start_time: {t.get('start_time')}")
    print(f"   window: {t.get('window_start_local')} - {t.get('window_end_local')}")
else:
    print("   NOT FOUND")

# 2. Check if this template was used on other days
print("\n2. PREVIOUS USES OF THIS TEMPLATE:")
result = supabase.table('scheduled_tasks').select('local_date, title, start_time, is_deleted, is_completed').eq('user_id', user_id).eq('template_id', '068ff515-1551-43f5-acbd-1051a8c84ad5').order('local_date', desc=True).execute()
if result.data:
    for t in result.data:
        print(f"   {t['local_date']}: {t['title']} (deleted={t.get('is_deleted')}, completed={t.get('is_completed')})")
else:
    print("   No previous uses")

# 3. Check "Clear leaves" task
print("\n3. CLEAR LEAVES TASK TODAY:")
result = supabase.table('scheduled_tasks').select('*').eq('user_id', user_id).eq('local_date', today).ilike('title', '%Clear leaves%').execute()
if result.data:
    for t in result.data:
        print(f"   ID: {t['id']}")
        print(f"   Template ID: {t.get('template_id')}")
        print(f"   is_appointment: {t.get('is_appointment')}")
        print(f"   is_routine: {t.get('is_routine')}")
        print(f"   is_fixed: {t.get('is_fixed')}")
        print(f"   start_time: {t.get('start_time')}")
        print(f"   end_time: {t.get('end_time')}")
else:
    print("   Not found in today's schedule")

# 4. Check what's at 16:05-16:50 today
print("\n4. WHAT'S SCHEDULED AT 16:05 TODAY:")
result = supabase.table('scheduled_tasks').select('title, is_appointment, start_time, end_time, template_id').eq('user_id', user_id).eq('local_date', today).execute()
if result.data:
    for t in result.data:
        start = t.get('start_time', '')
        if '16:05' in str(start) or '16:' in str(start):
            print(f"   {t['title']}")
            print(f"      Template ID: {t.get('template_id')}")
            print(f"      is_appointment: {t.get('is_appointment')}")
            print(f"      Times: {start} - {t.get('end_time')}")

# 5. Tasks with None start_time
print("\n5. TASKS WITH NULL START_TIME TODAY:")
result = supabase.table('scheduled_tasks').select('title, template_id, is_appointment').eq('user_id', user_id).eq('local_date', today).is_('start_time', 'null').execute()
if result.data:
    for t in result.data:
        print(f"   {t['title']} (template: {t.get('template_id')}, is_appointment: {t.get('is_appointment')})")
else:
    print("   None found")

print("\n6. SUMMARY OF TODAY'S SCHEDULE:")
result = supabase.table('scheduled_tasks').select('title, is_appointment, is_routine, is_fixed, start_time').eq('user_id', user_id).eq('local_date', today).order('start_time').execute()
if result.data:
    print(f"   Total tasks: {len(result.data)}")
    appt_count = sum(1 for t in result.data if t.get('is_appointment'))
    routine_count = sum(1 for t in result.data if t.get('is_routine'))
    floating_count = sum(1 for t in result.data if not t.get('is_appointment') and not t.get('is_routine') and not t.get('is_fixed'))
    null_time_count = sum(1 for t in result.data if t.get('start_time') is None)
    print(f"   Appointments: {appt_count}")
    print(f"   Routines: {routine_count}")
    print(f"   Floating: {floating_count}")
    print(f"   NULL start_time: {null_time_count}")
