import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"

# Check scheduled_tasks history for these templates on recent days
template_ids = {
    "209e8601-0b9f-42de-8a50-6406327d06fa": "coffee/reading",  
    "de0e34aa-1a30-4168-a59d-00ecd69aa119": "Lunch/reading"
}

print("=== Checking scheduled_tasks history for these templates ===")
for tid, name in template_ids.items():
    print(f"\n{name} (template {tid}):")
    
    # Check last few days
    response = supabase.table("scheduled_tasks")\
        .select("local_date, is_deleted, is_completed, updated_at")\
        .eq("template_id", tid)\
        .gte("local_date", "2025-12-27")\
        .order("local_date", desc=False)\
        .execute()
    
    if response.data:
        for task in response.data:
            print(f"  {task['local_date']}: deleted={task['is_deleted']}, completed={task['is_completed']}, updated={task.get('updated_at', 'N/A')[:19]}")
    else:
        print("  No scheduled tasks found")
