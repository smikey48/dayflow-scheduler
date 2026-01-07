import os
from supabase import create_client
from datetime import datetime, timedelta

# Initialize Supabase client
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")
supabase = create_client(url, key)

print("=" * 80)
print("CHECKING ANTONIA TASK")
print("=" * 80)

# Search for Antonia in task_templates
response = supabase.table('task_templates').select('*').ilike('title', '%antonia%').execute()

print(f"\nFound {len(response.data)} task template(s) with 'Antonia' in title:")
for task in response.data:
    print(f"\nTask ID: {task['id']}")
    print(f"  Title: {task['title']}")
    print(f"  User ID: {task['user_id']}")
    print(f"  Recurrence Rule: {task.get('recurrence_rule')}")
    print(f"  Is Deleted: {task.get('is_deleted', False)}")
    print(f"  Created At: {task.get('created_at')}")
    print(f"  Updated At: {task.get('updated_at')}")

# Check scheduled_tasks for today
today = datetime.now().date()
print(f"\n" + "=" * 80)
print(f"CHECKING SCHEDULED TASKS FOR TODAY ({today})")
print("=" * 80)

response = supabase.table('scheduled_tasks').select('*').eq('local_date', str(today)).execute()

antonia_scheduled = [st for st in response.data if 'antonia' in st.get('title', '').lower()]
print(f"\nFound {len(antonia_scheduled)} scheduled Antonia task(s) for today:")
for st in antonia_scheduled:
    print(f"\nScheduled Task ID: {st['id']}")
    print(f"  Title: {st['title']}")
    print(f"  Template ID: {st.get('template_id')}")
    print(f"  Local Date: {st['local_date']}")
    print(f"  Completed: {st.get('is_completed', False)}")

# Check all scheduled_tasks with Antonia
print(f"\n" + "=" * 80)
print(f"CHECKING ALL SCHEDULED ANTONIA TASKS")
print("=" * 80)

response = supabase.table('scheduled_tasks').select('*').order('local_date', desc=True).execute()
all_antonia = [st for st in response.data if 'antonia' in st.get('title', '').lower()]

print(f"\nFound {len(all_antonia)} total scheduled Antonia task(s) (last 10):")
for st in all_antonia[:10]:
    print(f"  {st['local_date']}: {st['title']} (ID: {st['id']}, Completed: {st.get('is_completed', False)}, Deleted: {st.get('is_deleted', False)})")
