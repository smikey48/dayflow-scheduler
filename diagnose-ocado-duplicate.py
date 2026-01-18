#!/usr/bin/env python3
"""Diagnose why Ocado delivery has multiple entries and wrong time."""

import os
from datetime import datetime
from zoneinfo import ZoneInfo
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
load_dotenv('.env.local')

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")

if not url or not key:
    print("Missing credentials")
    exit(1)

sb = create_client(url, key)
london_tz = ZoneInfo("Europe/London")
today = datetime.now(london_tz).date().isoformat()

# Get first user
users = sb.table("users").select("id").limit(1).execute()
user_id = users.data[0]["id"] if users.data else None

if not user_id:
    print("No users found")
    exit(1)

print(f"User: {user_id}")
print(f"Today: {today}\n")

# Find all Ocado templates
print("=" * 70)
print("TEMPLATES with 'Ocado' in title:")
print("=" * 70)
templates = sb.table("task_templates").select("*").eq("user_id", user_id).ilike("title", "%ocado%").execute()
for t in templates.data or []:
    print(f"ID: {t['id']}")
    print(f"  Title: {t['title']}")
    print(f"  Start time: {t.get('start_time')}")
    print(f"  Repeat: {t.get('repeat_unit') or t.get('repeat')}")
    print(f"  Is deleted: {t.get('is_deleted')}")
    print()

# Find all scheduled Ocado tasks
print("=" * 70)
print(f"SCHEDULED_TASKS with 'Ocado' (all dates):")
print("=" * 70)
scheduled = sb.table("scheduled_tasks").select("*").eq("user_id", user_id).ilike("title", "%ocado%").order("local_date", desc=True).execute()

# Group by date
from collections import defaultdict
by_date = defaultdict(list)
for task in scheduled.data or []:
    by_date[task['local_date']].append(task)

for date in sorted(by_date.keys(), reverse=True)[:3]:  # Show last 3 dates
    tasks = by_date[date]
    print(f"\n{date} ({len(tasks)} entries):")
    for task in tasks:
        utc_time = task.get('start_time')
        if utc_time:
            dt = datetime.fromisoformat(utc_time.replace('Z', '+00:00'))
            london_time = dt.astimezone(london_tz).strftime('%H:%M')
        else:
            london_time = "No time"
        
        status = []
        if task.get('is_completed'): status.append("COMPLETED")
        if task.get('is_deleted'): status.append("DELETED")
        status_str = f" [{', '.join(status)}]" if status else ""
        
        print(f"  • {task['id'][:8]}... → template {task.get('template_id', 'NONE')[:8] if task.get('template_id') else 'NONE'}...")
        print(f"    Time: {london_time}{status_str}")

print("\n" + "=" * 70)
print("ANALYSIS:")
print("=" * 70)

# Count unique template_ids in today's incomplete tasks
today_incomplete = [t for t in scheduled.data or [] if t['local_date'] == today and not t.get('is_completed') and not t.get('is_deleted')]
template_ids = [t.get('template_id') for t in today_incomplete if t.get('template_id')]
unique_templates = set(template_ids)

print(f"Today's incomplete tasks: {len(today_incomplete)}")
print(f"Unique template_ids: {len(unique_templates)}")
if len(unique_templates) > 1:
    print("⚠️  PROBLEM: Multiple template_ids for same task!")
    for tid in unique_templates:
        count = template_ids.count(tid)
        print(f"  - {tid[:8]}... appears {count} time(s)")
elif len(template_ids) > len(unique_templates):
    print("⚠️  PROBLEM: Duplicate entries with same template_id!")
    print("   This means deduplication is failing.")
else:
    print("✓ No duplicate template_ids")

# Check if any template_id doesn't match an existing template
template_id_set = {t['id'] for t in templates.data or []}
orphan_ids = unique_templates - template_id_set
if orphan_ids:
    print(f"\n⚠️  WARNING: {len(orphan_ids)} scheduled task(s) reference template_ids that don't exist:")
    for oid in orphan_ids:
        print(f"  - {oid}")
