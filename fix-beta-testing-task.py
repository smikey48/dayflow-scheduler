import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

template_id = "56c0c529-b646-4b85-92ff-3867cc5d309e"

# Fix 1: Set day_of_month and repeat_day to 1 (both fields needed for compatibility)
print("Setting day_of_month and repeat_day to 1...")
response = supabase.table("task_templates").update({
    "day_of_month": 1,
    "repeat_day": 1
}).eq("id", template_id).execute()
print("Template updated")

# Fix 2: Delete the scheduled task for today
print("\nDeleting scheduled task for today...")
response = supabase.table("scheduled_tasks").delete().eq("template_id", template_id).eq("local_date", "2025-12-29").execute()
print(f"Deleted {len(response.data)} scheduled task(s)")

print("\nDone! The task should now only appear on January 1st, 2026")
