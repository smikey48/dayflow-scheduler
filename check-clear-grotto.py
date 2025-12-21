from supabase import create_client
import os
from datetime import date

# Initialize Supabase client
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://prloxvewcsxaptzgxvyy.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY', 'sb_secret_ksC74t4wtkeOcdvNtxlVCQ_hkygZocg')
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# Your user ID
USER_ID = '3c877140-9539-47b9-898a-45eeab392e39'

# Today's date
today = str(date.today())
print(f"Checking 'Clear grotto' for {today}...")

# Check scheduled_tasks for "Clear grotto"
result = sb.table('scheduled_tasks')\
    .select('*')\
    .eq('user_id', USER_ID)\
    .eq('local_date', today)\
    .ilike('title', '%clear%grotto%')\
    .execute()

if result.data:
    print(f"\nFound {len(result.data)} task(s) matching 'Clear grotto':")
    for task in result.data:
        print(f"\nTitle: {task.get('title')}")
        print(f"Start time: {task.get('start_time')}")
        print(f"End time: {task.get('end_time')}")
        print(f"Duration: {task.get('duration_minutes')} minutes")
        print(f"Description (notes): {task.get('description')}")
        print(f"Template ID: {task.get('template_id')}")
        print(f"Is completed: {task.get('is_completed')}")
        print(f"Is deleted: {task.get('is_deleted')}")
        print("-" * 60)
else:
    print("No 'Clear grotto' task found in scheduled_tasks.")

# Also check the template
template_result = sb.table('task_templates')\
    .select('*')\
    .eq('user_id', USER_ID)\
    .ilike('title', '%clear%grotto%')\
    .execute()

if template_result.data:
    print(f"\nFound {len(template_result.data)} template(s) matching 'Clear grotto':")
    for tmpl in template_result.data:
        print(f"\nTemplate Title: {tmpl.get('title')}")
        print(f"Template ID: {tmpl.get('id')}")
        print(f"Duration: {tmpl.get('duration_minutes')} minutes")
        print(f"Window start: {tmpl.get('window_start_local')}")
        print(f"Window end: {tmpl.get('window_end_local')}")
        print(f"Kind: {tmpl.get('kind')}")
        print(f"Is deleted: {tmpl.get('is_deleted')}")
        print("-" * 60)
