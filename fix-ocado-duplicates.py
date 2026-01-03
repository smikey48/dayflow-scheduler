import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"

# Delete the two duplicate one-off Ocado delivery templates
# Keep only the weekly recurring one (663ba09d-235b-47be-a383-78af13b68f30)

templates_to_delete = [
    "e7dd9037-cceb-4414-915d-5709fde87b9a",
    "9eb18bee-9b63-4de1-bde6-fbdce85dfbdc"
]

print("Deleting duplicate Ocado delivery templates...")
for template_id in templates_to_delete:
    response = supabase.table("task_templates").update({"is_deleted": True}).eq("id", template_id).execute()
    print(f"Marked template {template_id} as deleted")

print("\nDeleting scheduled task for deleted template...")
response = supabase.table("scheduled_tasks").delete().eq("template_id", "9eb18bee-9b63-4de1-bde6-fbdce85dfbdc").eq("local_date", "2025-12-27").execute()
print(f"Deleted scheduled task")

print("\nDone!")
