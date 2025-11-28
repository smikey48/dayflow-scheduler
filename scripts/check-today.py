from supabase import create_client
import os
import sys
sys.path.append('C:\\Projects\\dayflow-scheduler')

# Load from environment variables (set in .env or system environment)
supabase_url = os.environ.get('SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not supabase_url or not supabase_key:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables")
    sys.exit(1)

sb = create_client(supabase_url, supabase_key)

print("=== TODAY'S TASKS (2025-11-16) ===")
tasks = sb.table('scheduled_tasks').select('title,is_completed,is_deleted,start_time,template_id').eq('local_date', '2025-11-16').execute()
for t in tasks.data:
    time_str = str(t.get('start_time', 'None'))[:16] if t.get('start_time') else 'None'
    print(f"{t['title']:30} comp={t['is_completed']} del={t['is_deleted']} time={time_str}")

print("\n=== YESTERDAY'S TASKS (2025-11-15) ===")
yesterday = sb.table('scheduled_tasks').select('title,is_completed,is_deleted').eq('local_date', '2025-11-15').in_('title', ['Recycle', 'Black bags', 'Spraying', 'Clear grotto', 'Clear leaves']).execute()
for t in yesterday.data:
    print(f"{t['title']:30} comp={t['is_completed']} del={t['is_deleted']}")
