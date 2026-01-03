import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"

template_ids = {
    "209e8601-0b9f-42de-8a50-6406327d06fa": "coffee/reading",  
    "de0e34aa-1a30-4168-a59d-00ecd69aa119": "Lunch/reading"
}

print("=== Checking scheduled_tasks to find when templates stopped being created ===")
for tid, name in template_ids.items():
    print(f"\n{name} (template {tid}):")
    
    # Get all scheduled tasks for this template, ordered by date
    response = supabase.table("scheduled_tasks")\
        .select("local_date, is_deleted, is_completed, created_at, updated_at")\
        .eq("template_id", tid)\
        .order("local_date", desc=False)\
        .execute()
    
    if response.data:
        print(f"  Found {len(response.data)} scheduled instances:")
        for task in response.data[-5:]:  # Show last 5
            print(f"    {task['local_date']}: created={task['created_at'][:19]}, updated={task.get('updated_at', 'N/A')[:19]}, deleted={task['is_deleted']}")
        
        # Find the gap - last scheduled date before today
        last_date = response.data[-1]['local_date']
        print(f"\n  Last scheduled date: {last_date}")
        if last_date != "2025-12-29":
            print(f"  ⚠️ MISSING from schedule on 2025-12-28 and 2025-12-29")
    else:
        print("  No scheduled tasks found")

# Check if there were any scheduled for 12-28
print("\n=== Checking if there were instances for 2025-12-28 ===")
for tid, name in template_ids.items():
    response = supabase.table("scheduled_tasks")\
        .select("local_date, created_at, is_deleted")\
        .eq("template_id", tid)\
        .eq("local_date", "2025-12-28")\
        .execute()
    
    if response.data:
        print(f"{name}: Found on 2025-12-28, created at {response.data[0]['created_at'][:19]}")
    else:
        print(f"{name}: NOT FOUND on 2025-12-28 - templates likely deleted before 2025-12-28 07:00")
