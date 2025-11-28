"""
Fix carry-forward to only carry tasks that were actually DUE on the carry-from day.

Currently, a Monday task that gets carried forward to Tuesday, then Wednesday, etc.
will keep getting carried forward every day. This is wrong - it should only carry
forward from days when it was actually scheduled to occur.

Solution: When carrying forward repeating tasks, check if they were actually due
on yesterday's date based on their repeat rules.
"""

import sys

scheduler_path = r"C:\Projects\dayflow-scheduler\dayflow\scheduler_main.py"

# Read the file
with open(scheduler_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the carry_forward function and add validation
old_code = '''      t_resp = supabase.table("task_templates").select(
          "id, is_deleted, repeat_unit, repeat, repeat_interval, repeat_days"
      ).in_("id", template_ids).execute()
      t_rows = t_resp.data or []
      t_by_id = {t["id"]: t for t in t_rows}

      # 3) Build a set of today's already-present template_ids to avoid dupes for repeats
      today_resp = supabase.table("scheduled_tasks").select("template_id")\\
          .eq("local_date", today).execute()
      todays_templates = {r["template_id"] for r in (today_resp.data or []) if r.get("template_id")}

      to_insert: list[dict] = []
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

new_code = '''      t_resp = supabase.table("task_templates").select(
          "id, is_deleted, repeat_unit, repeat, repeat_interval, repeat_days"
      ).in_("id", template_ids).execute()
      t_rows = t_resp.data or []
      t_by_id = {t["id"]: t for t in t_rows}

      # 3) Build a set of today's already-present template_ids to avoid dupes for repeats
      today_resp = supabase.table("scheduled_tasks").select("template_id")\\
          .eq("local_date", today).execute()
      todays_templates = {r["template_id"] for r in (today_resp.data or []) if r.get("template_id")}

      # 3b) Helper to check if a repeating task was actually due yesterday
      def was_due_yesterday(tmeta: dict, yesterday_date: date) -> bool:
          """Check if a repeating task should have been scheduled yesterday."""
          unit = (tmeta.get("repeat_unit") or tmeta.get("repeat") or "none").lower()
          
          if unit == "none":
              return True  # One-offs are always "due" if they exist
          
          if unit == "daily":
              return True  # Daily tasks are due every day
          
          if unit == "weekly":
              repeat_days = tmeta.get("repeat_days") or []
              if repeat_days:
                  # Day of week: Monday=0, Sunday=6
                  yesterday_dow = yesterday_date.weekday()
                  return yesterday_dow in repeat_days
              return False
          
          if unit == "monthly":
              # Check if yesterday's day-of-month matches
              day_of_month = tmeta.get("day_of_month")
              if day_of_month:
                  return yesterday_date.day == day_of_month
              return False
          
          # Unknown repeat type - don't carry forward
          return False

      to_insert: list[dict] = []
      yesterday_date = run_date - timedelta(days=1)
      
      for r in y_rows:
          tid = r.get("template_id")
          if not tid:
              continue
          tmeta = t_by_id.get(tid, {})

          # **Skip** if the template was soft-deleted
          if tmeta.get("is_deleted") is True:
              continue

          # **Skip** if this repeating task was NOT actually due yesterday
          if not was_due_yesterday(tmeta, yesterday_date):
              print(f"[carry_forward] Skipping '{r.get('title')}' - not due yesterday")
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

if old_code in content:
    content = content.replace(old_code, new_code)
    
    with open(scheduler_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("✅ Patch applied successfully!")
    print("Carry-forward will now validate that repeating tasks were actually due yesterday.")
else:
    print("❌ Could not find the target code section.")
    print("The scheduler may have been updated. Manual review needed.")
    sys.exit(1)
