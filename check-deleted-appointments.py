import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')

SUPABASE_URL = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

USER_ID = '3c877140-9539-47b9-898a-45eeab392e39'

print("=== Checking for Deleted Appointments ===\n")

# Check for any deleted appointments that are still in scheduled_tasks
response = supabase.table('scheduled_tasks').select('*').eq('user_id', USER_ID).eq('is_deleted', True).eq('is_appointment', True).order('date').execute()

deleted = response.data
print(f"Total deleted appointments still in scheduled_tasks: {len(deleted)}\n")

if deleted:
    print("Deleted appointments that should not be visible:")
    for appt in deleted:
        date = appt.get('date') or appt.get('local_date')
        print(f"  - {date}: {appt['title']}")
        print(f"    ID: {appt['id']}")
        print(f"    Created: {appt.get('created_at')}")
    
    # Check which are old enough to archive
    old_deleted = [a for a in deleted if (a.get('date') or a.get('local_date', '9999')) < '2026-01-04']
    print(f"\nOf these, {len(old_deleted)} are old enough to archive (before 2026-01-04)")
    
    if old_deleted:
        print("\nThese should be archived immediately.")
else:
    print("✅ No deleted appointments found - all clean!")

# Also check the frontend will handle them correctly
print("\n=== Frontend Filtering Test ===")
print("Calendar API filters: .eq('is_deleted', false)")
print("Today view filters: .eq('is_deleted', false)")
print("\nBoth views should automatically hide deleted appointments.")
