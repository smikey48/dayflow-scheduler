from supabase import create_client
import os

# Initialize Supabase client
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://prloxvewcsxaptzgxvyy.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY', 'sb_secret_ksC74t4wtkeOcdvNtxlVCQ_hkygZocg')
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# Your user ID
USER_ID = '3c877140-9539-47b9-898a-45eeab392e39'

# Add explanation to Clear grotto
result = sb.table('scheduled_tasks')\
    .update({
        'description': 'No available time slot within window [14:00–16:30]'
    })\
    .eq('user_id', USER_ID)\
    .eq('template_id', 'f7fdd0e6-c96b-4a88-b792-5dccbfa27efa')\
    .eq('local_date', '2025-12-20')\
    .execute()

print(f"Updated {len(result.data)} task(s)")
print("Clear grotto should now display with the explanation.")
