"""
Simplify carry-forward logic to match correct business rules:

ROUTINES: Never carry forward (they have fixed time slots)
FLOATING: Always carry forward if incomplete, UNLESS re-instantiated today

The "was_due_yesterday" validation I added was WRONG. A Monday floating task that
wasn't completed should keep carrying forward every day until either:
  1. Completed/deleted/skipped
  2. Re-instantiated (next Monday arrives and creates a fresh instance)
"""

import sys

scheduler_path = r"C:\Projects\dayflow-scheduler\dayflow\scheduler_main.py"

with open(scheduler_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace the overly complex logic with simple correct logic
old_logic = '''    to_insert: list[dict] = []
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

# Simple correct logic: carry forward UNLESS re-instantiated today
new_logic = '''    to_insert: list[dict] = []
    
    for r in y_rows:
        tid = r.get("template_id")
        if not tid:
            continue
        tmeta = t_by_id.get(tid, {})

        # **Skip** if the template was soft-deleted
        if tmeta.get("is_deleted") is True:
            continue

        # SIMPLE RULE: Carry forward UNLESS already instantiated today
        # (If today is Monday and this is a Monday task, it will be re-instantiated,
        #  so we skip the carry-forward. Otherwise, keep carrying it.)
        if tid in todays_templates:
            print(f"[carry_forward] Skipping '{r.get('title')}' - already instantiated today")
            continue'''

if old_logic in content:
    content = content.replace(old_logic, new_logic)
    
    with open(scheduler_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("✅ Simplified carry-forward logic!")
    print("\nNew rule: Floating tasks carry forward until completed/deleted OR re-instantiated.")
    print("No more day-of-week validation - if it's incomplete, it carries forward.")
else:
    print("❌ Could not find target code.")
    print("The scheduler may have different formatting. Checking for alternative match...")
    
    # Try to find just the key section
    if "was_due_yesterday" in content:
        print("Found was_due_yesterday code - manual cleanup needed.")
    
    sys.exit(1)
