import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"

# Check coffee/reading and lunch/reading templates
print("=== Checking Templates ===")
response = supabase.table("task_templates").select("*").eq("user_id", user_id).or_("title.ilike.%coffee/reading%,title.ilike.%lunch/reading%").execute()

for template in response.data:
    print(f"\nTitle: {template['title']}")
    print(f"Template ID: {template['id']}")
    print(f"Repeat Unit: {template['repeat_unit']}")
    print(f"Is Routine: {template['is_routine']}")
    print(f"Start Time: {template.get('start_time')}")
    print(f"Is Deleted: {template['is_deleted']}")
    
    # Check if scheduled for today
    print("\n  Checking scheduled for 2025-12-29:")
    sched_response = supabase.table("scheduled_tasks").select("*").eq("template_id", template['id']).eq("local_date", "2025-12-29").execute()
    
    if sched_response.data:
        for task in sched_response.data:
            print(f"    Found: start_time={task.get('start_time')}, is_deleted={task['is_deleted']}, is_completed={task['is_completed']}")
    else:
        print("    NOT SCHEDULED FOR TODAY")
