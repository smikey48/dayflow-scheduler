import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

# Check if coffee/reading and lunch/reading have date fields set
template_ids = [
    "209e8601-0b9f-42de-8a50-6406327d06fa",  # coffee/reading
    "de0e34aa-1a30-4168-a59d-00ecd69aa119"   # Lunch/reading
]

print("=== Checking if routines have date field set ===")
for template_id in template_ids:
    response = supabase.table("task_templates").select("title, repeat_unit, date").eq("id", template_id).execute()
    
    if response.data:
        task = response.data[0]
        print(f"\n{task['title']}:")
        print(f"  Repeat Unit: {task['repeat_unit']}")
        print(f"  Date: {task.get('date')}")
