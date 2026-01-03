import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"

# Check the DayFlow Beta testing task template
print("=== DayFlow Beta testing Task Template ===")
response = supabase.table("task_templates").select("*").eq("user_id", user_id).ilike("title", "%DayFlow Beta testing%").execute()

if response.data:
    for template in response.data:
        print(f"\nTemplate ID: {template['id']}")
        print(f"Title: {template['title']}")
        print(f"Repeat Unit: {template['repeat_unit']}")
        print(f"Repeat Interval: {template.get('repeat_interval')}")
        print(f"Day of Month: {template.get('day_of_month')}")
        print(f"Date (reference): {template.get('date')}")
        print(f"Is Deleted: {template.get('is_deleted')}")

# Check scheduled tasks for today
print("\n\n=== Scheduled Tasks for Today (2025-12-29) ===")
response = supabase.table("scheduled_tasks").select("*").eq("user_id", user_id).eq("local_date", "2025-12-29").ilike("title", "%DayFlow Beta testing%").execute()

if response.data:
    for task in response.data:
        print(f"\nScheduled Task ID: {task['id']}")
        print(f"Template ID: {task['template_id']}")
        print(f"Title: {task['title']}")
        print(f"Start Time: {task.get('start_time')}")
        print(f"Is Deleted: {task.get('is_deleted')}")
        print(f"Is Completed: {task.get('is_completed')}")
else:
    print("No scheduled task for today")
