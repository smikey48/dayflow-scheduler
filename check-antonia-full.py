import os
from supabase import create_client
from datetime import datetime

# Initialize Supabase client
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")
supabase = create_client(url, key)

template_id = "6da2dd7a-d937-44c6-9ef5-5dd955fdd739"

print("Getting full details of Antonia task template...")
print(f"Template ID: {template_id}")

# Get the full task template
result = supabase.table('task_templates').select('*').eq('id', template_id).execute()

if result.data:
    task = result.data[0]
    print(f"\nFull task template data:")
    for key, value in sorted(task.items()):
        print(f"  {key}: {value}")
else:
    print("Task not found!")
