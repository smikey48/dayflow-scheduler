from supabase import create_client

sb = create_client('https://prloxvewcsxaptzgxvyy.supabase.co', 'sb_secret_ksC74t4wtkeOcdvNtxlVCQ_hkygZocg')

# Only 'code dayflow2 - correct schedule logic' was actually completed
# Reset all others to not completed
print('Resetting completion status...')

# First, set everything to not completed
result = sb.table('scheduled_tasks')\
    .update({'is_completed': False})\
    .eq('user_id', '3c877140-9539-47b9-898a-45eeab392e39')\
    .eq('local_date', '2025-12-01')\
    .execute()

print(f'✓ Reset all tasks to not completed')

# Then mark only the actually completed task
result = sb.table('scheduled_tasks')\
    .update({'is_completed': True})\
    .eq('user_id', '3c877140-9539-47b9-898a-45eeab392e39')\
    .eq('local_date', '2025-12-01')\
    .eq('title', 'code dayflow2 - correct schedule logic')\
    .execute()

print(f'✓ Marked "code dayflow2 - correct schedule logic" as completed')

print('\nDone!')
