import os
from supabase import create_client

os.environ['SUPABASE_URL'] = 'https://prloxvewcsxaptzgxvyy.supabase.co'
os.environ['SUPABASE_SERVICE_KEY'] = 'sb_secret_ksC74t4wtkeOcdvNtxlVCQ_hkygZocg'

sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

# Get today's schedule
tasks = sb.table('scheduled_tasks').select('start_time, end_time, title, is_routine, is_fixed').eq('user_id', '3c877140-9539-47b9-898a-45eeab392e39').eq('local_date', '2025-11-29').eq('is_deleted', False).order('start_time').execute()

print("\nToday's Schedule:")
print("-" * 60)
for t in tasks.data[:15]:
    start = t['start_time'][:5] if t['start_time'] else 'None '
    end = t['end_time'][:5] if t['end_time'] else 'None'
    routine = 'R' if t['is_routine'] else ' '
    fixed = 'F' if t['is_fixed'] else ' '
    print(f"{start} - {end} : {routine}{fixed} {t['title']}")
