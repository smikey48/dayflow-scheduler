import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
supabase = create_client(url, key)

template_id = "cc517de9-6836-40ab-a03e-daa7b68bc1b5"

print("=== Current State ===")
result = supabase.table('task_templates').select('*').eq('id', template_id).single().execute()
template = result.data
print(f"Title: {template['title']}")
print(f"repeat_unit: {template.get('repeat_unit')}")
print(f"repeat_interval: {template.get('repeat_interval')}")
print(f"date: {template.get('date')}")

print("\n=== Analysis ===")
print("The task has repeat_unit='daily', which makes it a recurring daily task.")
print("For a one-off task that should appear on July 1, 2026, it should be:")
print("  repeat_unit: 'none'")
print("  date: '2026-07-01'")

confirm = input("\nUpdate this task to be a one-off (repeat_unit='none')? (yes/no): ")

if confirm.lower() == 'yes':
    print("\n=== Updating Template ===")
    update_result = supabase.table('task_templates').update({
        'repeat_unit': 'none'
    }).eq('id', template_id).execute()
    
    if update_result.data:
        print("✅ Template updated successfully!")
        print(f"New state: repeat_unit={update_result.data[0].get('repeat_unit')}, date={update_result.data[0].get('date')}")
        
        print("\n=== Deleting today's scheduled instance ===")
        from datetime import date
        today = date.today().isoformat()
        
        delete_result = supabase.table('scheduled_tasks').delete().eq('template_id', template_id).eq('local_date', today).execute()
        print(f"✅ Deleted {len(delete_result.data) if delete_result.data else 0} scheduled task(s) for today")
    else:
        print("❌ Update failed")
else:
    print("Update cancelled")
