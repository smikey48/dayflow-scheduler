#!/usr/bin/env python3
"""Restore Check sewers instance for Jan 5, 2026"""

import os
from dotenv import load_dotenv
from supabase import create_client

# Load environment
load_dotenv('.env.local')

# Initialize Supabase client
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

print("Restoring Check sewers for 2026-01-05...")

# Update the Jan 5 instance to undelete it
result = supabase.table('scheduled_tasks').update({
    'is_deleted': False
}).eq('template_id', '7422ae8c-6294-457b-b9af-845bd6e61b71').eq('local_date', '2026-01-05').execute()

print(f"Updated {len(result.data)} row(s)")
print("Instance restored. Run scheduler to carry forward.")
