from supabase import create_client
import os

sb = create_client('https://prloxvewcsxaptzgxvyy.supabase.co', 'sb_secret_ksC74t4wtkeOcdvNtxlVCQ_hkygZocg')

result = sb.table('scheduled_tasks')\
    .select('title, start_time, end_time, priority')\
    .eq('local_date', '2025-12-01')\
    .eq('user_id', '3c877140-9539-47b9-898a-45eeab392e39')\
    .order('start_time')\
    .execute()

print('=== DEC 1 SCHEDULE ===')
for r in result.data:
    if r.get('start_time'):
        start = r['start_time'][11:16]
        end = r['end_time'][11:16]
        print(f"{start} - {end} | P{r['priority']} | {r['title']}")
    else:
        print(f"NO TIME      | P{r['priority']} | {r['title']}")
