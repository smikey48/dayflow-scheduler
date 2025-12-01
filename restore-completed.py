from supabase import create_client

sb = create_client('https://prloxvewcsxaptzgxvyy.supabase.co', 'sb_secret_ksC74t4wtkeOcdvNtxlVCQ_hkygZocg')

# Tasks that were completed before the schedule rebuild
completed_tasks = [
    'coffee/reading',
    'Lunch/reading',
    'Book clearing',
    'Woodland Management Plan',
    'DayFlow activation',
    'Clear grotto',
    'Clear leaves',
    'emails',
    'Letting flat 3',
    'Choir practice',
    'Desk clear/paperwork',
    'ADHD assessment'
]

print(f'Marking {len(completed_tasks)} tasks as completed...')

for task_title in completed_tasks:
    result = sb.table('scheduled_tasks')\
        .update({'is_completed': True})\
        .eq('user_id', '3c877140-9539-47b9-898a-45eeab392e39')\
        .eq('local_date', '2025-12-01')\
        .eq('title', task_title)\
        .execute()
    
    if result.data:
        print(f'  ✓ {task_title}')
    else:
        print(f'  ✗ {task_title} (not found)')

print('\nDone!')
