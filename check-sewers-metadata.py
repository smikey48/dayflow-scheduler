#!/usr/bin/env python3
"""Check when Check sewers Jan 5 instance was marked deleted"""

import os
from dotenv import load_dotenv
from supabase import create_client

# Load environment
load_dotenv('.env.local')

# Initialize Supabase client
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

# Get Check sewers Jan 5 instance with all metadata
result = supabase.table('scheduled_tasks').select('*').eq('template_id', '7422ae8c-6294-457b-b9af-845bd6e61b71').eq('local_date', '2026-01-05').execute()

if result.data:
    task = result.data[0]
    print('Check sewers Jan 5 instance:')
    print(f"  ID: {task['id']}")
    print(f"  created_at: {task.get('created_at')}")
    print(f"  updated_at: {task.get('updated_at')}")
    print(f"  is_deleted: {task.get('is_deleted')}")
    print(f"  is_completed: {task.get('is_completed')}")
    print(f"  start_time: {task.get('start_time')}")
    print(f"  end_time: {task.get('end_time')}")
    
    # Check if there are multiple records for this date/template
    all_instances = supabase.table('scheduled_tasks').select('id, created_at, updated_at, is_deleted').eq('template_id', '7422ae8c-6294-457b-b9af-845bd6e61b71').eq('local_date', '2026-01-05').execute()
    
    if len(all_instances.data) > 1:
        print(f"\n⚠️  Found {len(all_instances.data)} instances for this date/template:")
        for idx, inst in enumerate(all_instances.data):
            print(f"  Instance {idx+1}: is_deleted={inst['is_deleted']}, created={inst['created_at']}, updated={inst['updated_at']}")
else:
    print("No instance found for Check sewers on 2026-01-05")
