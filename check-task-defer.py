import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

# Search for the task template
result = supabase.table('task_templates').select('id, title, date, repeat_unit').eq('user_id', '3c877140-9539-47b9-898a-45eeab392e39').ilike('title', '%washing machine%').execute()

print('Task template info:')
for task in result.data:
    print(f"  ID: {task['id']}")
    print(f"  Title: {task['title']}")
    print(f"  Repeat Unit: {task['repeat_unit']}")
    print(f"  Defer Date: {task['date']}")
    print()
    
    # Check if it's in today's schedule
    template_id = task['id']
    scheduled = supabase.table('scheduled_tasks').select('id, title, local_date, start_time, is_deleted').eq('user_id', '3c877140-9539-47b9-898a-45eeab392e39').eq('template_id', template_id).eq('local_date', '2025-12-27').execute()
    
    if scheduled.data:
        print(f"  Found in today's schedule (2025-12-27):")
        for s in scheduled.data:
            print(f"    Start time: {s.get('start_time')}")
            print(f"    Is deleted: {s.get('is_deleted')}")
    else:
        print(f"  NOT in today's schedule (2025-12-27)")

