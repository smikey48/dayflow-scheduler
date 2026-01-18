import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import date

load_dotenv('.env.local')

url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"  # Replace with your user ID if different

# Find the PAY TAX BILL template
print("=== PAY TAX BILL Template ===")
result = supabase.table('task_templates').select('*').eq('user_id', user_id).ilike('title', '%PAY TAX%').execute()

if result.data:
    for template in result.data:
        print(f"\nTemplate ID: {template['id']}")
        print(f"Title: {template['title']}")
        print(f"repeat_unit: {template.get('repeat_unit')}")
        print(f"repeat_interval: {template.get('repeat_interval')}")
        print(f"date (reference/defer): {template.get('date')}")
        print(f"is_deleted: {template.get('is_deleted')}")
        print(f"created_at: {template.get('created_at')}")
        
        template_id = template['id']
        
        # Check if it's scheduled for today
        today = date.today().isoformat()
        print(f"\n=== Scheduled instances for today ({today}) ===")
        scheduled = supabase.table('scheduled_tasks').select('*').eq('user_id', user_id).eq('template_id', template_id).eq('local_date', today).execute()
        
        if scheduled.data:
            print(f"Found {len(scheduled.data)} instance(s):")
            for task in scheduled.data:
                print(f"  ID: {task['id']}")
                print(f"  Title: {task['title']}")
                print(f"  Start time: {task.get('start_time')}")
                print(f"  Is completed: {task.get('is_completed')}")
                print(f"  Is deleted: {task.get('is_deleted')}")
        else:
            print("Not scheduled for today")
else:
    print("Template not found")
