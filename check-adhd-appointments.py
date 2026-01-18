import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')

SUPABASE_URL = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

USER_ID = '3c877140-9539-47b9-898a-45eeab392e39'

print("=== ADHD Interview Appointments ===\n")

# Get all ADHD interview tasks
response = supabase.table('scheduled_tasks').select('*').eq('user_id', USER_ID).ilike('title', '%ADHD interview%').order('date').execute()

tasks = response.data
print(f"Total ADHD interview tasks: {len(tasks)}\n")

for i, task in enumerate(tasks, 1):
    print(f"Task {i}:")
    print(f"  ID: {task['id']}")
    print(f"  Date: {task.get('date') or task.get('local_date')}")
    print(f"  Time: {task.get('start_time')} - {task.get('end_time')}")
    print(f"  Is appointment: {task.get('is_appointment')}")
    print(f"  Is deleted: {task.get('is_deleted')}")
    print(f"  Is completed: {task.get('is_completed')}")
    print(f"  Template ID: {task.get('template_id')}")
    print(f"  Created: {task.get('created_at')}")
    print(f"  Updated: {task.get('updated_at')}")
    print()

# Check the template
if tasks and tasks[0].get('template_id'):
    template_id = tasks[0]['template_id']
    template_response = supabase.table('task_templates').select('*').eq('id', template_id).execute()
    if template_response.data:
        template = template_response.data[0]
        print("Template:")
        print(f"  ID: {template['id']}")
        print(f"  Title: {template['title']}")
        print(f"  Reference date: {template.get('date')}")
        print(f"  Recurrence: {template.get('recurrence_pattern')}")
