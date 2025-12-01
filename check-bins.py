from supabase import create_client
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv('.env.local')

sb = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')
)

# Check templates
result = sb.table('task_templates').select(
    'id, title, repeat_unit, repeat_interval, date'
).in_('title', ['Black bags', 'Recycle']).execute()

print('\n=== Template Details ===')
import json
for t in result.data:
    print(f"\n{t['title']}:")
    print(f"  ID: {t['id']}")
    print(f"  Repeat: {t['repeat_unit']}, interval: {t['repeat_interval']}")
    print(f"  Reference date: {t.get('date')}")

# Check which was scheduled for today
today = '2025-12-01'
scheduled = sb.table('scheduled_tasks').select(
    'title, start_time, local_date'
).in_('title', ['Black bags', 'Recycle']).eq('local_date', today).execute()

print(f'\n=== Scheduled for {today} ===')
if scheduled.data:
    for s in scheduled.data:
        print(f"{s['title']} at {s['start_time']}")
else:
    print('Neither task scheduled')

# Check recent history
recent = sb.table('scheduled_tasks').select(
    'title, local_date, is_completed'
).in_('title', ['Black bags', 'Recycle']).order('local_date', desc=True).limit(10).execute()

print(f'\n=== Recent History (last 10) ===')
for r in recent.data:
    print(f"{r['local_date']}: {r['title']:15} completed={r['is_completed']}")
