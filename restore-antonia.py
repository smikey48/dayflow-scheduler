import os
from supabase import create_client
from datetime import datetime

# Initialize Supabase client
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")
supabase = create_client(url, key)

template_id = "6da2dd7a-d937-44c6-9ef5-5dd955fdd739"

print("Restoring Antonia task template...")
print(f"Template ID: {template_id}")

# Restore the task template
result = supabase.table('task_templates').update({
    'is_deleted': False
}).eq('id', template_id).execute()

print(f"\n✓ Successfully restored Antonia task template")
print(f"  Updated at: {datetime.now()}")

# Verify the update
verify = supabase.table('task_templates').select('*').eq('id', template_id).execute()
if verify.data:
    task = verify.data[0]
    print(f"\nVerification:")
    print(f"  Title: {task['title']}")
    print(f"  Is Deleted: {task['is_deleted']}")
    print(f"  Updated At: {task['updated_at']}")
