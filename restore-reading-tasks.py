import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

# Restore both tasks
template_ids = [
    "209e8601-0b9f-42de-8a50-6406327d06fa",  # coffee/reading
    "de0e34aa-1a30-4168-a59d-00ecd69aa119"   # Lunch/reading
]

print("Restoring deleted tasks...")
for template_id in template_ids:
    response = supabase.table("task_templates").update({
        "is_deleted": False
    }).eq("id", template_id).execute()
    
    if response.data:
        print(f"Restored: {response.data[0]['title']}")

print("\nDone! Run the scheduler to add them to today's schedule.")
