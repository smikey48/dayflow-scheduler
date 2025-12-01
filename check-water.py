from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv('.env.local')

sb = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
)

result = sb.table('scheduled_tasks').select(
    'title, start_time, end_time, duration_minutes, is_deleted, is_completed'
).eq('local_date', '2025-12-01').order('start_time').execute()

print('\n=== Tasks for 2025-12-01 ===')
for t in result.data:
    time_str = str(t['start_time'] or 'NO TIME')[:16]
    print(f"{t['title'][:35]:35} {time_str:16} del={t['is_deleted']} comp={t['is_completed']}")

print(f'\nTotal: {len(result.data)} tasks')

# Check specifically for Water management
water = [t for t in result.data if 'water' in t['title'].lower()]
if water:
    print('\n=== Water Management Details ===')
    import json
    print(json.dumps(water, indent=2))
else:
    print('\n❌ Water management NOT FOUND in scheduled_tasks for today')
