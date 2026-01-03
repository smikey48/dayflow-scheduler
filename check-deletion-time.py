import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

# Check when these were deleted
template_ids = [
    "209e8601-0b9f-42de-8a50-6406327d06fa",  # coffee/reading
    "de0e34aa-1a30-4168-a59d-00ecd69aa119"   # Lunch/reading
]

print("=== Checking template update timestamps ===")
for template_id in template_ids:
    response = supabase.table("task_templates").select("title, created_at, updated_at, is_deleted").eq("id", template_id).execute()
    
    if response.data:
        task = response.data[0]
        print(f"\n{task['title']}:")
        print(f"  Created: {task['created_at']}")
        print(f"  Updated: {task['updated_at']}")
        print(f"  Is Deleted: {task['is_deleted']}")
