"""Fix: Only mark appointments/routines as fixed, not all floating tasks."""
import re

path = r"C:\Projects\dayflow-scheduler\dayflow\scheduler_main.py"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the section and replace it
old_pattern = r'''            # 🔑 CRITICAL: Mark already-scheduled tasks as FIXED so they won't be moved during re-scheduling
            if not all_today_df\.empty and 'start_time' in all_today_df\.columns:
                # Tasks with times should be treated as immovable \(like appointments\)
                all_today_df\['is_fixed'\] = True
                # 🔑 CRITICAL: Ensure fixed tasks are not marked as deleted \(they're being kept in schedule\)
                all_today_df\['is_deleted'\] = False
                logging\.info\(f"Marked \{len\(all_today_df\)\} already-scheduled tasks as fixed"\)
                # Debug: log which tasks are marked as fixed
                if 'title' in all_today_df\.columns:
                    fixed_titles = all_today_df\['title'\]\.tolist\(\)
                    logging\.info\(f"Fixed tasks: \{fixed_titles\}"\)'''

new_code = '''            # 🔑 CRITICAL: Mark ONLY appointments/routines as fixed, not floating tasks
            if not all_today_df.empty and 'start_time' in all_today_df.columns:
                # Only appointments and routines are truly immovable
                if 'is_appointment' in all_today_df.columns and 'is_routine' in all_today_df.columns:
                    all_today_df['is_fixed'] = all_today_df['is_appointment'] | all_today_df['is_routine']
                    fixed_count = all_today_df['is_fixed'].sum()
                    logging.info(f"Marked {fixed_count} appointments/routines as fixed (floating tasks remain movable)")
                else:
                    all_today_df['is_fixed'] = True
                    logging.info(f"WARNING: Marked all {len(all_today_df)} tasks as fixed (is_appointment/is_routine missing)")
                all_today_df['is_deleted'] = False
                if 'title' in all_today_df.columns and 'is_fixed' in all_today_df.columns:
                    fixed_mask = all_today_df['is_fixed'] == True
                    if fixed_mask.any():
                        fixed_titles = all_today_df[fixed_mask]['title'].tolist()
                        logging.info(f"Fixed tasks: {fixed_titles}")'''

if re.search(old_pattern, content):
    content = re.sub(old_pattern, new_code, content)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ Fixed: Only appointments/routines will be marked as fixed")
else:
    print("❌ Pattern not found")
