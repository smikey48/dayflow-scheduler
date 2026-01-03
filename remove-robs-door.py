#!/usr/bin/env python3
"""Remove Fix Rob's Door from today's schedule"""

from supabase import create_client
import os
from datetime import date

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_KEY')

if not url or not key:
    try:
        with open('.env.local', 'r') as f:
            for line in f:
                if line.startswith('SUPABASE_URL='):
                    url = line.split('=', 1)[1].strip()
                elif line.startswith('SUPABASE_SERVICE_KEY='):
                    key = line.split('=', 1)[1].strip()
    except Exception as e:
        print(f"Error reading .env.local: {e}")

if not url or not key:
    print("Missing credentials")
    exit(1)

supabase = create_client(url, key)
user_id = '3c877140-9539-47b9-898a-45eeab392e39'
today = date.today().isoformat()
template_id = '909cde04-794a-4ebb-93c1-b840ec236c3c'

print("Removing 'Fix Rob's Door' from today's schedule...")

# Delete the scheduled task for today
result = supabase.table('scheduled_tasks').delete().eq('user_id', user_id).eq('local_date', today).eq('template_id', template_id).execute()

if result.data:
    print(f"✓ Removed {len(result.data)} task(s)")
else:
    print("No tasks found to remove")

# Verify
result = supabase.table('scheduled_tasks').select('*').eq('user_id', user_id).eq('local_date', today).eq('template_id', template_id).execute()
if not result.data:
    print("✓ Verified: Task no longer in today's schedule")
else:
    print("⚠ Warning: Task still present")
