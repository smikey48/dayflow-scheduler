"""
Fix weekly task reference_date calculation to use first valid day-of-week occurrence.

Bug: When a weekly task with repeat_days is created (e.g., on Sunday) but should occur
on Mondays, using created_at as reference_date causes interval calculations to drift.

Example:
- Template created Nov 10 (Sunday)  
- repeat_days=[0] (Monday), repeat_interval=2
- Using Nov 10 as reference:
  - Nov 20 (Thu): weeks_since = 10/7 = 1, 1%2=1 ✗ (should be 0)
- Should use Nov 11 (first Monday) as reference:
  - Nov 20 (Thu): Not Monday, skip ✓
  - Nov 25 (Mon): weeks_since = 14/7 = 2, 2%2=0 ✓

Solution: When created_at is used as reference for weekly tasks with repeat_days,
adjust it forward to the first occurrence of a valid day-of-week.
"""

import sys

planner_path = r"C:\Projects\dayflow-scheduler\dayflow\planner.py"

with open(planner_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the section where reference_date is set from created_at
old_section = '''        # 🔑 CRITICAL: For recurring tasks with interval > 1, use created_at as reference
        # This ensures biweekly/monthly tasks appear on a fixed schedule, not based on today
        date_raw = task.get("date")
        if pd.isna(date_raw) and repeat_interval > 1 and repeat_unit in ["weekly", "monthly"]:
            # Use created_at as the anchor point for interval calculation
            created_at_raw = task.get("created_at")
            logging.info(f"[DEBUG] Task '{task.get('title')}': repeat_interval={repeat_interval}, created_at_raw={created_at_raw}, type={type(created_at_raw)}")
            if pd.notna(created_at_raw):
                reference_date = pd.to_datetime(created_at_raw, errors='coerce')
                logging.info(f"[DEBUG] Converted to reference_date={reference_date}, isna={pd.isna(reference_date)}")
            else:
                reference_date = today
        else:
            reference_date = today if pd.isna(date_raw) else pd.to_datetime(date_raw, errors='coerce')'''

new_section = '''        # 🔑 CRITICAL: For recurring tasks with interval > 1, use created_at as reference
        # This ensures biweekly/monthly tasks appear on a fixed schedule, not based on today
        date_raw = task.get("date")
        if pd.isna(date_raw) and repeat_interval > 1 and repeat_unit in ["weekly", "monthly"]:
            # Use created_at as the anchor point for interval calculation
            created_at_raw = task.get("created_at")
            logging.info(f"[DEBUG] Task '{task.get('title')}': repeat_interval={repeat_interval}, created_at_raw={created_at_raw}, type={type(created_at_raw)}")
            if pd.notna(created_at_raw):
                reference_date = pd.to_datetime(created_at_raw, errors='coerce')
                logging.info(f"[DEBUG] Converted to reference_date={reference_date}, isna={pd.isna(reference_date)}")
                
                # 🔧 FIX: For weekly tasks with repeat_days, adjust reference to first valid day-of-week
                if repeat_unit == "weekly":
                    repeat_days_raw = task.get("repeat_days")
                    if isinstance(repeat_days_raw, list) and len(repeat_days_raw) > 0:
                        # Ensure reference_date is timezone-aware
                        if reference_date.tzinfo is None:
                            reference_date = reference_date.tz_localize(LOCAL_TIMEZONE)
                        else:
                            reference_date = reference_date.tz_convert(LOCAL_TIMEZONE)
                        
                        # Find the first occurrence of a valid day-of-week at or after reference_date
                        valid_days = sorted([int(d) for d in repeat_days_raw])
                        ref_dow = reference_date.dayofweek  # Monday=0, Sunday=6
                        
                        # Find next valid day (could be today if ref_dow is in valid_days)
                        days_to_add = None
                        for target_dow in valid_days:
                            if target_dow >= ref_dow:
                                days_to_add = target_dow - ref_dow
                                break
                        
                        # If no valid day found this week, use first valid day of next week
                        if days_to_add is None:
                            days_to_add = 7 - ref_dow + valid_days[0]
                        
                        reference_date = reference_date + pd.Timedelta(days=days_to_add)
                        logging.info(f"[DEBUG] Adjusted weekly reference_date to first valid day: {reference_date.date()} (was {pd.to_datetime(created_at_raw).date()})")
            else:
                reference_date = today
        else:
            reference_date = today if pd.isna(date_raw) else pd.to_datetime(date_raw, errors='coerce')'''

if old_section in content:
    content = content.replace(old_section, new_section)
    
    with open(planner_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("✅ Patch applied successfully!")
    print("\nWeekly tasks with repeat_days will now use the first valid day-of-week as reference.")
    print("This ensures interval calculations align with the actual scheduled days.")
    print("\nExample:")
    print("  Template created Nov 10 (Sun), repeat_days=[0] (Mon), interval=2")
    print("  Old: reference=Nov 10 (Sun) → Nov 20 checks weeks_since=1, 1%2=1 ✗")
    print("  New: reference=Nov 11 (Mon) → Nov 20 not Monday ✗, Nov 25 is Monday + weeks_since=2, 2%2=0 ✓")
else:
    print("❌ Could not find the target code section.")
    print("The planner may have been updated. Manual review needed.")
    sys.exit(1)
