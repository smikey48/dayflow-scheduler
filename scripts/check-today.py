from supabase import create_client
import os
import sys
sys.path.append('C:\\Projects\\dayflow-scheduler')

os.environ['SUPABASE_URL'] = 'https://prloxvewcsxaptzgxvyy.supabase.co'
os.environ['SUPABASE_SERVICE_KEY'] = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBybG94dmV3Y3N4YXB0emd4dnl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNjkxODU4MCwiZXhwIjoyMDQyNDk0NTgwfQ.IH4e6IB-S2rp_AwT0xH2YAJ7l7aZ4HU0YIJcJhySxCc'

sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

print("=== TODAY'S TASKS (2025-11-16) ===")
tasks = sb.table('scheduled_tasks').select('title,is_completed,is_deleted,start_time,template_id').eq('local_date', '2025-11-16').execute()
for t in tasks.data:
    time_str = str(t.get('start_time', 'None'))[:16] if t.get('start_time') else 'None'
    print(f"{t['title']:30} comp={t['is_completed']} del={t['is_deleted']} time={time_str}")

print("\n=== YESTERDAY'S TASKS (2025-11-15) ===")
yesterday = sb.table('scheduled_tasks').select('title,is_completed,is_deleted').eq('local_date', '2025-11-15').in_('title', ['Recycle', 'Black bags', 'Spraying', 'Clear grotto', 'Clear leaves']).execute()
for t in yesterday.data:
    print(f"{t['title']:30} comp={t['is_completed']} del={t['is_deleted']}")
