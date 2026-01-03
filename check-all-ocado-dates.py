#!/usr/bin/env python3
"""Check where the Ocado task was actually written"""
import os
from supabase import create_client

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"
template_id = "44c31187-1a50-411a-a0d3-72384517edf1"

# Check all dates for this template
response = supabase.table("scheduled_tasks") \
    .select("id, title, template_id, is_deleted, is_completed, start_time, local_date") \
    .eq("user_id", user_id) \
    .eq("template_id", template_id) \
    .order("local_date") \
    .execute()

if response.data:
    print(f"Found {len(response.data)} 'finalise Ocado order' task(s):")
    import json
    print(json.dumps(response.data, indent=2))
else:
    print("No 'finalise Ocado order' tasks found")
