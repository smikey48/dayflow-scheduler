#!/usr/bin/env python3
"""Check if Ocado task appears for tomorrow (2025-12-25)"""
import os
from supabase import create_client

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"
tomorrow = "2025-12-25"

# Check scheduled_tasks for tomorrow
response = supabase.table("scheduled_tasks") \
    .select("id, title, template_id, is_deleted, is_completed, start_time") \
    .eq("user_id", user_id) \
    .eq("local_date", tomorrow) \
    .ilike("title", "%ocado%") \
    .execute()

if response.data:
    print(f"Found {len(response.data)} Ocado task(s) for {tomorrow}:")
    import json
    print(json.dumps(response.data, indent=2))
else:
    print(f"No Ocado tasks found for {tomorrow}")

# Check if template is weekly Wednesday
template_response = supabase.table("task_templates") \
    .select("id, title, repeat_unit, repeat_days") \
    .eq("id", "44c31187-1a50-411a-a0d3-72384517edf1") \
    .single() \
    .execute()

if template_response.data:
    print(f"\nTemplate info:")
    print(f"  Title: {template_response.data['title']}")
    print(f"  Repeat: {template_response.data['repeat_unit']}")
    print(f"  Days: {template_response.data['repeat_days']}")
    print(f"  2025-12-25 is a: Thursday")
    print(f"  Should appear? {'No' if template_response.data['repeat_days'] == [2] else 'Check days'}")
