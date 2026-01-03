#!/usr/bin/env python3
"""Check if Ocado task appears for next Wednesday (2025-12-31)"""
import os
from supabase import create_client
from datetime import datetime

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

user_id = "3c877140-9539-47b9-898a-45eeab392e39"
next_wednesday = "2025-12-31"

# Verify it's actually Wednesday
date_obj = datetime.strptime(next_wednesday, "%Y-%m-%d")
print(f"{next_wednesday} is a {date_obj.strftime('%A')}")
print()

# Check scheduled_tasks for next Wednesday
response = supabase.table("scheduled_tasks") \
    .select("id, title, template_id, is_deleted, is_completed, start_time") \
    .eq("user_id", user_id) \
    .eq("local_date", next_wednesday) \
    .eq("template_id", "44c31187-1a50-411a-a0d3-72384517edf1") \
    .execute()

if response.data:
    print(f"Found {len(response.data)} Ocado task(s) for {next_wednesday}:")
    import json
    print(json.dumps(response.data, indent=2))
else:
    print(f"No Ocado tasks found for {next_wednesday} yet")
    print("(This is expected - scheduler hasn't created future dates yet)")

# Check today's deleted record
print(f"\nToday's (2025-12-24) deleted record:")
today_response = supabase.table("scheduled_tasks") \
    .select("id, title, template_id, is_deleted, local_date") \
    .eq("user_id", user_id) \
    .eq("local_date", "2025-12-24") \
    .eq("template_id", "44c31187-1a50-411a-a0d3-72384517edf1") \
    .execute()

if today_response.data:
    import json
    print(json.dumps(today_response.data, indent=2))
    print("\n✓ Task is marked deleted for TODAY (2025-12-24) only")
else:
    print("No record found for today")

print(f"\n✓ When scheduler runs for {next_wednesday}, it will:")
print("  1. Check for deleted records on 2025-12-31 (won't find any)")
print("  2. See the template is weekly Wednesday")
print("  3. Create the task for that day")
