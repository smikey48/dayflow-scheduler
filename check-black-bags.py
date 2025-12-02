from supabase import create_client

sb = create_client('https://prloxvewcsxaptzgxvyy.supabase.co', 'sb_secret_ksC74t4wtkeOcdvNtxlVCQ_hkygZocg')

result = sb.table('scheduled_tasks')\
    .select('title, start_time, end_time, duration_minutes, is_completed')\
    .eq('local_date', '2025-12-02')\
    .eq('user_id', '3c877140-9539-47b9-898a-45eeab392e39')\
    .eq('title', 'Black bags')\
    .execute()

print('Black bags on Dec 2:')
if result.data:
    for r in result.data:
        print(f'  Title: {r["title"]}')
        print(f'  Start time: {r.get("start_time")}')
        print(f'  End time: {r.get("end_time")}')
        print(f'  Duration: {r.get("duration_minutes")} minutes')
        print(f'  Completed: {r.get("is_completed")}')
else:
    print('  No Black bags task found for Dec 2')
