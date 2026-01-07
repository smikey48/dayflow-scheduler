"""
Audit script to find deleted tasks and when they were deleted.
Helps diagnose when is_deleted gets set incorrectly.
"""

import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import datetime, timedelta

# Load environment
load_dotenv('.env.local')

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("=" * 80)
print("AUDIT: Deleted Task Templates")
print("=" * 80)

# Find all deleted templates
result = supabase.table("task_templates").select("*").eq("is_deleted", True).order("updated_at", desc=True).execute()

if not result.data:
    print("✅ No deleted templates found")
else:
    print(f"\n📋 Found {len(result.data)} deleted template(s):\n")
    
    for task in result.data:
        print(f"Title: {task['title']}")
        print(f"  ID: {task['id']}")
        print(f"  Created: {task.get('created_at', 'N/A')[:19]}")
        print(f"  Updated: {task.get('updated_at', 'N/A')[:19]}")
        print(f"  Repeat: {task.get('repeat_unit')} (interval: {task.get('repeat_interval')})")
        print(f"  Repeat Days: {task.get('repeat_days')}")
        print(f"  Repeat Day: {task.get('repeat_day')}")
        
        # Calculate when it was deleted (updated_at timestamp)
        if task.get('updated_at'):
            try:
                updated = datetime.fromisoformat(task['updated_at'].replace('Z', '+00:00'))
                now = datetime.now(updated.tzinfo)
                delta = now - updated
                
                if delta.days == 0:
                    print(f"  ⏰ Deleted: Today ({delta.seconds // 3600} hours ago)")
                elif delta.days == 1:
                    print(f"  ⏰ Deleted: Yesterday")
                else:
                    print(f"  ⏰ Deleted: {delta.days} days ago")
            except:
                print(f"  ⏰ Deleted: {task['updated_at'][:19]}")
        
        print()

print("\n" + "=" * 80)
print("AUDIT: Recently Deleted Scheduled Tasks (last 7 days)")
print("=" * 80)

# Check for deleted scheduled tasks in the last 7 days
seven_days_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')

result = supabase.table("scheduled_tasks").select("local_date, title, updated_at, template_id").eq("is_deleted", True).gte("local_date", seven_days_ago).order("updated_at", desc=True).limit(50).execute()

if not result.data:
    print("✅ No recently deleted scheduled tasks found")
else:
    print(f"\n📋 Found {len(result.data)} recently deleted scheduled task(s):\n")
    
    # Group by template_id
    by_template = {}
    for task in result.data:
        tid = task.get('template_id', 'no-template')
        if tid not in by_template:
            by_template[tid] = []
        by_template[tid].append(task)
    
    for template_id, tasks in by_template.items():
        print(f"Template ID: {template_id}")
        print(f"  Title: {tasks[0]['title']}")
        print(f"  Deleted instances: {len(tasks)}")
        print(f"  Dates: {', '.join(t['local_date'] for t in tasks[:5])}")
        if len(tasks) > 5:
            print(f"         ... and {len(tasks) - 5} more")
        print()

print("\n" + "=" * 80)
print("RECOMMENDATIONS")
print("=" * 80)
print("""
1. Review the deleted templates above
2. Check if any were deleted unintentionally
3. Look at the "Deleted: X days ago" to correlate with user actions
4. Consider restoring tasks by setting is_deleted=False
5. Use the fix-pay-bills.py script as a template for restoration

To restore a task:
  supabase.table("task_templates").update({"is_deleted": False}).eq("id", "<task-id>")
""")
