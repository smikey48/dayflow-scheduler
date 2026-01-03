import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"

# Check if there are OTHER templates that were also recently marked as deleted
print("=== Looking for other recently deleted templates ===")
response = supabase.table("task_templates").select("id, title, is_deleted, updated_at").eq("user_id", user_id).eq("is_deleted", True).execute()

if response.data:
    print(f"Found {len(response.data)} deleted templates:")
    for template in response.data:
        print(f"  - {template['title']} (updated: {template['updated_at']})")
else:
    print("No deleted templates found")

# Also check if coffee/reading and Lunch/reading have any history of being updated today
print("\n=== Checking update history for the two routines ===")
template_ids = [
    "209e8601-0b9f-42de-8a50-6406327d06fa",  # coffee/reading  
    "de0e34aa-1a30-4168-a59d-00ecd69aa119"   # Lunch/reading
]

for tid in template_ids:
    response = supabase.table("task_templates").select("title, updated_at, created_at").eq("id", tid).execute()
    if response.data:
        task = response.data[0]
        print(f"\n{task['title']}:")
        print(f"  Created: {task['created_at']}")
        print(f"  Last Updated: {task['updated_at']}")
