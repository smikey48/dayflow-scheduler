"""
Fix the "Pay Bills" task that was somehow corrupted.

Issue: repeat_day is NULL and is_deleted is TRUE
Expected: repeat_days=[1] (Tuesday) and is_deleted=FALSE

Note: In our system, days are 0-indexed where Monday=0, Tuesday=1, etc.
"""

import os
from dotenv import load_dotenv
from supabase import create_client

# Load environment
load_dotenv('.env.local')

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# First, check the current state
print("Checking current state of 'Pay Bills' task...")
result = supabase.table("task_templates").select("*").ilike("title", "%Pay Bills%").execute()

if not result.data:
    print("❌ No 'Pay Bills' task found")
    exit(1)

for task in result.data:
    print(f"\n📋 Found task: {task['title']}")
    print(f"   ID: {task['id']}")
    print(f"   repeat_unit: {task.get('repeat_unit')}")
    print(f"   repeat_day: {task.get('repeat_day')}")
    print(f"   repeat_days: {task.get('repeat_days')}")
    print(f"   repeat_interval: {task.get('repeat_interval')}")
    print(f"   is_deleted: {task.get('is_deleted')}")
    print(f"   created_at: {task.get('created_at')}")
    
    # Check if it needs fixing
    needs_fix = False
    updates = {}
    
    if task.get('is_deleted') == True:
        print("   ⚠️  is_deleted is TRUE (should be FALSE)")
        updates['is_deleted'] = False
        needs_fix = True
    
    if task.get('repeat_unit') == 'weekly' and not task.get('repeat_days'):
        print("   ⚠️  repeat_days is NULL (should be [1] for Tuesday)")
        updates['repeat_days'] = [1]  # Tuesday
        needs_fix = True
    
    if task.get('repeat_day') is not None:
        print(f"   ℹ️  repeat_day is set to {task.get('repeat_day')} (legacy field, should use repeat_days)")
        updates['repeat_day'] = None
        needs_fix = True
    
    if needs_fix:
        print(f"\n🔧 Applying fixes: {updates}")
        confirm = input("Apply these fixes? (yes/no): ")
        if confirm.lower() == 'yes':
            update_result = supabase.table("task_templates").update(updates).eq("id", task['id']).execute()
            if update_result.data:
                print("✅ Fixed successfully!")
                print(f"   New state: {update_result.data[0]}")
            else:
                print(f"❌ Update failed")
        else:
            print("❌ Skipped")
    else:
        print("   ✅ No fixes needed")
