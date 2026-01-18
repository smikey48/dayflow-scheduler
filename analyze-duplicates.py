import os
from supabase import create_client
from datetime import datetime
from dotenv import load_dotenv

load_dotenv('.env.local')

SUPABASE_URL = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

USER_ID = '3c877140-9539-47b9-898a-45eeab392e39'

# Analyze high-duplicate tasks
high_dup_titles = ['Clear leaves', 'Clear grotto', 'Water management', 'Desk clear/paperwork', 'Milling project']

for title in high_dup_titles:
    print(f"\n=== {title} ===")
    response = supabase.table('scheduled_tasks').select('*').eq('user_id', USER_ID).eq('title', title).order('date').execute()
    tasks = response.data
    
    completed = sum(1 for t in tasks if t.get('is_completed'))
    deleted = sum(1 for t in tasks if t.get('is_deleted'))
    active = sum(1 for t in tasks if not t.get('is_completed') and not t.get('is_deleted'))
    old = sum(1 for t in tasks if (t.get('date') or t.get('local_date', '9999')) < '2026-01-04')
    
    print(f"Total: {len(tasks)}")
    print(f"  Active: {active}")
    print(f"  Completed: {completed}")
    print(f"  Deleted: {deleted}")
    print(f"  Old (before Jan 4): {old}")
    
    if tasks:
        dates = [t.get('date') or t.get('local_date') for t in tasks]
        print(f"  Date range: {min(dates)} to {max(dates)}")
