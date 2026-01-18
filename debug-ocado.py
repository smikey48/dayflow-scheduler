#!/usr/bin/env python3
"""Debug script to check Ocado delivery task in template vs scheduled_tasks."""

import os
from datetime import datetime
from zoneinfo import ZoneInfo
from supabase import create_client

# Load environment
from dotenv import load_dotenv
load_dotenv()
load_dotenv('.env.local')

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")

if not url or not key:
    print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    exit(1)

sb = create_client(url, key)

# Get first user if TEST_USER_ID not set
user_id = os.getenv("TEST_USER_ID")
if not user_id:
    print("TEST_USER_ID not set, finding first user...")
    users = sb.table("users").select("id").limit(1).execute()
    if users.data:
        user_id = users.data[0]["id"]
    else:
        print("No users found in database")
        exit(1)

# Get today in London time
london_tz = ZoneInfo("Europe/London")
today = datetime.now(london_tz).date().isoformat()

print(f"Checking for user: {user_id}")
print(f"Today's date: {today}\n")

# Check template
print("=" * 60)
print("TEMPLATE (task_templates):")
print("=" * 60)
template_resp = sb.table("task_templates").select("*").eq("user_id", user_id).ilike("title", "%ocado%").execute()
for tmpl in template_resp.data or []:
    print(f"ID: {tmpl['id']}")
    print(f"Title: {tmpl['title']}")
    print(f"Start time: {tmpl.get('start_time')}")
    print(f"Repeat: {tmpl.get('repeat_unit') or tmpl.get('repeat')}")
    print(f"Is deleted: {tmpl.get('is_deleted')}")
    print()

# Check scheduled tasks
print("=" * 60)
print(f"SCHEDULED TASKS for {today}:")
print("=" * 60)
scheduled_resp = sb.table("scheduled_tasks").select("*").eq("user_id", user_id).eq("local_date", today).ilike("title", "%ocado%").execute()
for task in scheduled_resp.data or []:
    print(f"ID: {task['id']}")
    print(f"Template ID: {task.get('template_id')}")
    print(f"Title: {task['title']}")
    print(f"Start time (UTC): {task.get('start_time')}")
    if task.get('start_time'):
        # Convert UTC to London time for display
        from datetime import datetime
        utc_time = datetime.fromisoformat(task['start_time'].replace('Z', '+00:00'))
        london_time = utc_time.astimezone(london_tz)
        print(f"Start time (London): {london_time.strftime('%H:%M:%S')}")
    print(f"Is completed: {task.get('is_completed')}")
    print(f"Is deleted: {task.get('is_deleted')}")
    print()

if not (template_resp.data or scheduled_resp.data):
    print("No Ocado tasks found. Showing all tasks for today...")
    print("\nAll scheduled tasks for today:")
    all_today = sb.table("scheduled_tasks").select("id, title, start_time, template_id").eq("user_id", user_id).eq("local_date", today).execute()
    for task in (all_today.data or [])[:20]:
        start = task.get('start_time')
        if start:
            from datetime import datetime
            utc_time = datetime.fromisoformat(start.replace('Z', '+00:00'))
            london_time = utc_time.astimezone(london_tz)
            time_str = london_time.strftime('%H:%M')
        else:
            time_str = "No time"
        print(f"  - {task['title']}: {time_str} (template: {task.get('template_id', 'none')[:8] if task.get('template_id') else 'none'})")
    
    print("\nAll appointment templates:")
    all_appts = sb.table("task_templates").select("id, title, start_time, is_appointment").eq("user_id", user_id).eq("is_deleted", False).order("title").execute()
    for a in (all_appts.data or [])[:20]:
        is_appt = " [APPT]" if a.get('is_appointment') else ""
        print(f"  - {a['title']}: {a.get('start_time')}{is_appt}")
