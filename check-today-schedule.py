import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"
date = "2025-12-28"

# Check tasks for today
print(f"=== Scheduled Tasks for {date} ===")
response = supabase.table("scheduled_tasks").select("id, title, start_time, is_appointment, is_routine, is_fixed, is_deleted").eq("user_id", user_id).eq("local_date", date).eq("is_deleted", False).execute()

print(f"Found {len(response.data)} tasks\n")

floating_without_times = []
for task in response.data:
    is_floating = not task['is_appointment'] and not task['is_routine'] and not task['is_fixed']
    has_time = task['start_time'] is not None
    
    print(f"Title: {task['title']}")
    print(f"  Is Floating: {is_floating}")
    print(f"  Has Time: {has_time}")
    print(f"  Start Time: {task['start_time']}")
    print()
    
    if is_floating and not has_time:
        floating_without_times.append(task['title'])

print(f"\n=== Summary ===")
print(f"Total tasks: {len(response.data)}")
print(f"Floating tasks without times: {len(floating_without_times)}")
if floating_without_times:
    print("Tasks needing scheduling:")
    for title in floating_without_times:
        print(f"  - {title}")
