# Python script to patch scheduler_main.py  
import re

scheduler_path = r"C:\Projects\dayflow-scheduler\dayflow\scheduler_main.py"

with open(scheduler_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add pandas import if not present at start of main()
if 'def main() -> int:\n    _assert_required_env()' in content and '\n    import pandas as pd\n' not in content[:content.find('def main()') + 200]:
    print("Adding pandas import to main() function...")
    content = content.replace(
        'def main() -> int:\n    _assert_required_env()',
        'def main() -> int:\n    _assert_required_env()\n    import pandas as pd'
    )

# 2. Add re-scheduling logic after carry_forward
find_pattern = """    # 5) Carry forward incomplete one-off or eligible repeating floaters
    carry_forward_incomplete_one_offs(run_date=run_date, supabase=sb)

    return 0"""

replace_with = """    # 5) Carry forward incomplete one-off or eligible repeating floaters
    carry_forward_incomplete_one_offs(run_date=run_date, supabase=sb)

    # 6) Re-schedule carried-forward tasks (they were inserted with null times)
    if sb is not None and args.user:
        logging.info("Re-scheduling carried-forward floating tasks...")
        resp = sb.table("scheduled_tasks").select("*")\\
            .eq("local_date", run_date.isoformat())\\
            .eq("user_id", args.user)\\
            .is_("start_time", "null")\\
            .execute()
        unscheduled = resp.data or []
        if unscheduled:
            logging.info(f"Found {len(unscheduled)} unscheduled carried tasks, running schedule_day...")
            carried_df = pd.DataFrame(unscheduled)
            schedule_day(
                tasks_df=carried_df,
                day_start=day_start,
                day_end=day_end,
                supabase=sb,
                user_id=args.user,
                whitelist_template_ids=whitelist_ids,
                dry_run=effective_dry_run,
            )
            logging.info(f"Re-scheduled {len(unscheduled)} carried-forward task(s).")
        else:
            logging.info("No unscheduled carried tasks found.")

    return 0"""

if find_pattern in content:
    print("✅ Found carry_forward pattern, applying patch...")
    content = content.replace(find_pattern, replace_with)
    
    with open(scheduler_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("✅ Patch applied successfully!")
    print("Run 'Recreate Schedule' to test the fix.")
else:
    print("❌ Could not find the carry_forward pattern.")
    print("Pattern to find:")
    print(find_pattern)
