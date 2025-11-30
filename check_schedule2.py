import os
from supabase import create_client

sb = create_client('https://prloxvewcsxaptzgxvyy.supabase.co', 'sb_secret_ksC74t4wtkeOcdvNtxlVCQ_hkygZocg')

tasks = sb.table('scheduled_tasks').select('start_time, end_time, title').eq('user_id', '3c877140-9539-47b9-898a-45eeab392e39').eq('local_date', '2025-11-29').eq('is_deleted', False).order('start_time').execute()

print("\nFirst 10 tasks:")
for i, t in enumerate(tasks.data[:10]):
    print(f"{i+1}. {t['start_time']} - {t['end_time']} : {t['title']}")
