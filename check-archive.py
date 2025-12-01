from supabase import create_client

sb = create_client('https://prloxvewcsxaptzgxvyy.supabase.co', 'sb_secret_ksC74t4wtkeOcdvNtxlVCQ_hkygZocg')

# Check archive for Dec 1
result = sb.table('scheduled_tasks_archive').select('*').eq('local_date', '2025-12-01').eq('user_id', '3c877140-9539-47b9-898a-45eeab392e39').order('archived_at', desc=True).execute()

print(f'Found {len(result.data)} archived tasks for Dec 1')

if result.data:
    print('\nArchived tasks (most recent first):')
    for r in result.data[:20]:
        time_str = str(r.get('start_time') or 'NO TIME')[:16]
        print(f"{r['title']:35} {time_str:16} comp={r['is_completed']} del={r['is_deleted']} archived={r['archived_at'][:19]}")
