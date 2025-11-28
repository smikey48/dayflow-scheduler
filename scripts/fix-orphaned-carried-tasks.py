"""
Fix orphaned carried-forward tasks that never got scheduled.

Bug: When --force recreates the schedule, it soft-deletes uncompleted floating tasks,
but it doesn't delete carried-forward tasks that have start_time=null (waiting to be scheduled).
These orphans from previous runs stay in the database and get re-scheduled again.

Solution: During --force cleanup, ALSO delete any floating tasks with null start_time.
"""

import sys

scheduler_path = r"C:\Projects\dayflow-scheduler\dayflow\scheduler_main.py"

with open(scheduler_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Old code: only deletes is_completed=False tasks
old_section = '''          # Now soft-delete uncompleted floating tasks (they'll be recreated fresh)
          delete_resp = sb.table("scheduled_tasks")\\
              .update({"is_deleted": True})\\
              .eq("local_date", run_date.isoformat())\\
              .eq("user_id", args.user)\\
              .eq("is_appointment", False)\\
              .eq("is_routine", False)\\
              .eq("is_completed", False)\\
              .eq("is_deleted", False)\\
              .execute()
          if delete_resp.data:
              deleted_count = len(delete_resp.data)
              logging.info(f"Soft-deleted {deleted_count} uncompleted floating tasks (will be recreated)")'''

# New code: ALSO deletes unscheduled (null start_time) carried tasks
new_section = '''          # Now soft-delete uncompleted floating tasks (they'll be recreated fresh)
          delete_resp = sb.table("scheduled_tasks")\\
              .update({"is_deleted": True})\\
              .eq("local_date", run_date.isoformat())\\
              .eq("user_id", args.user)\\
              .eq("is_appointment", False)\\
              .eq("is_routine", False)\\
              .eq("is_completed", False)\\
              .eq("is_deleted", False)\\
              .execute()
          if delete_resp.data:
              deleted_count = len(delete_resp.data)
              logging.info(f"Soft-deleted {deleted_count} uncompleted floating tasks (will be recreated)")
          
          # ALSO delete orphaned carried-forward tasks (null start_time from previous runs)
          orphan_resp = sb.table("scheduled_tasks")\\
              .delete()\\
              .eq("local_date", run_date.isoformat())\\
              .eq("user_id", args.user)\\
              .eq("is_appointment", False)\\
              .eq("is_routine", False)\\
              .is_("start_time", "null")\\
              .execute()
          if orphan_resp.data:
              orphan_count = len(orphan_resp.data)
              logging.info(f"Deleted {orphan_count} orphaned unscheduled tasks (null start_time)")'''

if old_section in content:
    content = content.replace(old_section, new_section)
    
    with open(scheduler_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("✅ Patch applied successfully!")
    print("\n--force will now delete orphaned unscheduled tasks from previous runs.")
else:
    print("❌ Could not find the target code section.")
    sys.exit(1)
