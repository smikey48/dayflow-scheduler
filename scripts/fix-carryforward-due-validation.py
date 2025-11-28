"""
Fix carry-forward to only carry repeating tasks that were actually DUE yesterday.

Bug: A Monday-only task that gets carried to Tuesday will keep getting carried forward
every day because the code only checks "is it already present today?" but not
"was it supposed to run yesterday?"

Solution: Add a check to validate that weekly/monthly tasks were actually scheduled
for yesterday's day-of-week or day-of-month.
"""

import sys
from datetime import date, timedelta

scheduler_path = r"C:\Projects\dayflow-scheduler\dayflow\scheduler_main.py"

# Read the file  
with open(scheduler_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Old code: doesn't validate if task was due yesterday
old_section = '''    to_insert: list[dict] = []
    for r in y_rows:
        tid = r.get("template_id")
        if not tid:
            continue
        tmeta = t_by_id.get(tid, {})

        # **Skip** if the template was soft-deleted
        if tmeta.get("is_deleted") is True:
            continue

        # Canonicalize repeat: prefer 'repeat' if present
        unit = (tmeta.get("repeat_unit") or tmeta.get("repeat") or "none").lower()

        if unit == "none":
            # one-off → always carry forward
            pass
        else:
            # repeating → only if not already present today
            # (e.g., weekly task incomplete yesterday should be carried forward)
            if tid in todays_templates:
                print(f"[carry_forward] Skipping '{r.get('title')}' - already present today")
                continue'''

# New code: validates task was due yesterday before carrying forward
new_section = '''    to_insert: list[dict] = []
    yesterday_date = run_date - timedelta(days=1)
    
    for r in y_rows:
        tid = r.get("template_id")
        if not tid:
            continue
        tmeta = t_by_id.get(tid, {})

        # **Skip** if the template was soft-deleted
        if tmeta.get("is_deleted") is True:
            continue

        # Canonicalize repeat: prefer 'repeat' if present
        unit = (tmeta.get("repeat_unit") or tmeta.get("repeat") or "none").lower()

        if unit == "none":
            # one-off → always carry forward
            pass
        else:
            # For repeating tasks, verify they were actually DUE yesterday
            # (not just sitting in schedule from an earlier carry-forward)
            was_due_yesterday = False
            
            if unit == "daily":
                was_due_yesterday = True
            elif unit == "weekly":
                repeat_days = tmeta.get("repeat_days") or []
                if repeat_days:
                    yesterday_dow = yesterday_date.weekday()  # Monday=0, Sunday=6
                    was_due_yesterday = yesterday_dow in repeat_days
            elif unit == "monthly":
                day_of_month = tmeta.get("day_of_month")
                if day_of_month:
                    was_due_yesterday = yesterday_date.day == day_of_month
            
            if not was_due_yesterday:
                print(f"[carry_forward] Skipping '{r.get('title')}' - not due yesterday ({unit})")
                continue
            
            # repeating → only if not already present today
            # (e.g., weekly task incomplete yesterday should be carried forward)
            if tid in todays_templates:
                print(f"[carry_forward] Skipping '{r.get('title')}' - already present today")
                continue'''

if old_section in content:
    content = content.replace(old_section, new_section)
    
    with open(scheduler_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("✅ Patch applied successfully!")
    print("\nCarry-forward now validates that repeating tasks were actually due yesterday.")
    print("This prevents Monday-only tasks from being carried forward on other days.")
else:
    print("❌ Could not find the target code section.")
    sys.exit(1)
