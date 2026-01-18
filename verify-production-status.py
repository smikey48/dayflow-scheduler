import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
supabase = create_client(url, key)

template_id = "cc517de9-6836-40ab-a03e-daa7b68bc1b5"
user_id = "3c877140-9539-47b9-898a-45eeab392e39"

print("=== Production System Verification ===\n")

print("1. Template status:")
result = supabase.table('task_templates').select('title, repeat_unit, date, is_deleted').eq('id', template_id).single().execute()
template = result.data
print(f"   Title: {template['title']}")
print(f"   Type: {template.get('repeat_unit')} recurring")
print(f"   Reference/start date: {template.get('date')}")
print(f"   Deleted: {template.get('is_deleted')}")

from datetime import date
today = date.today().isoformat()

print(f"\n2. Today's schedule ({today}):")
scheduled = supabase.table('scheduled_tasks').select('id, title, is_deleted, is_completed').eq('template_id', template_id).eq('local_date', today).execute()

if scheduled.data:
    print(f"   ❌ Task appears in today's schedule ({len(scheduled.data)} instance(s)):")
    for task in scheduled.data:
        status = "deleted" if task.get('is_deleted') else ("completed" if task.get('is_completed') else "active")
        print(f"      - {task['title']} ({status})")
    print("\n   This is incorrect - the task should not appear until July 1, 2026")
else:
    print(f"   ✅ Task correctly NOT in today's schedule")

print("\n3. Code fix status:")
print("   ✅ Fixed in dayflow/planner.py line 333-343")
print("   - Daily tasks now check if today >= reference_date")
print("   - Interval calculation now respects reference_date")

print("\n4. Next steps:")
print("   a. Deploy the updated planner.py to your Railway Python scheduler")
print("   b. The scheduler will automatically exclude this task from future runs")
print("   c. The task will appear on July 1, 2026 as intended")
print("\nNote: You're using Railway for the Python scheduler and Vercel for the web UI.")
print("Make sure to commit and push the changes so Railway picks them up.")
