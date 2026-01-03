import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"
date = "2025-12-27"

# Check for duplicate Ocado delivery tasks in scheduled_tasks
print("=== Scheduled Tasks for 'Ocado delivery' on 2025-12-27 ===")
response = supabase.table("scheduled_tasks").select("*").eq("user_id", user_id).eq("local_date", date).ilike("title", "%Ocado delivery%").execute()
print(f"Found {len(response.data)} scheduled task(s)")
for task in response.data:
    print(f"\nID: {task['id']}")
    print(f"Template ID: {task['template_id']}")
    print(f"Title: {task['title']}")
    print(f"Start: {task.get('start_time')}")
    print(f"End: {task.get('end_time')}")
    print(f"Is Deleted: {task.get('is_deleted')}")
    print(f"Is Completed: {task.get('is_completed')}")

# Check task_templates for Ocado delivery
print("\n\n=== Task Templates for 'Ocado delivery' ===")
response = supabase.table("task_templates").select("*").eq("user_id", user_id).ilike("title", "%Ocado delivery%").execute()
print(f"Found {len(response.data)} template(s)")
for template in response.data:
    print(f"\nID: {template['id']}")
    print(f"Title: {template['title']}")
    print(f"Repeat Unit: {template.get('repeat_unit')}")
    print(f"Repeat Days: {template.get('repeat_days')}")
    print(f"Date: {template.get('date')}")
    print(f"Is Deleted: {template.get('is_deleted')}")
