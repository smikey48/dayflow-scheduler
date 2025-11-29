# Fix for overlapping floating tasks
# The issue: when scheduling floating tasks into gaps, we need to check against 
# BOTH fixed tasks AND already-scheduled floating tasks

import re

file_path = r'C:\Projects\dayflow-scheduler\dayflow\planner.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the section where we schedule floating tasks
# We need to combine schedule_df_fixed with already-scheduled floating tasks

pattern = r'(scheduled_floating_tasks_list = \[\])\s+(for _, task in floating_tasks_only_df\.iterrows\(\):)'

replacement = r'''\1

    # Track all scheduled tasks (fixed + floating) to prevent overlaps
    all_scheduled_tasks = schedule_df_fixed.to_dict('records') if not schedule_df_fixed.empty else []

    \2'''

new_content = re.sub(pattern, replacement, content)

# Now update the gap placement to use all_scheduled_tasks
pattern2 = r'(# schedule the task at the start of the effective gap\s+start_time = eff_start\s+end_time = start_time \+ duration)'

replacement2 = r'''# schedule the task at the start of the effective gap
                start_time = eff_start
                end_time = start_time + duration

                # Check for overlap with ALL scheduled tasks (fixed + floating)
                has_overlap = False
                for scheduled in all_scheduled_tasks:
                    sched_start = scheduled['start_time']
                    sched_end = scheduled['end_time']
                    # Check if [start_time, end_time) overlaps with [sched_start, sched_end)
                    if not (end_time <= sched_start or start_time >= sched_end):
                        has_overlap = True
                        break
                
                if has_overlap:
                    # Skip this gap, try next one
                    continue'''

new_content = re.sub(pattern2, replacement2, new_content, flags=re.DOTALL)

# After successfully scheduling, add to all_scheduled_tasks list
pattern3 = r'(scheduled_floating_tasks_list\.append\({[^}]+}\))\s+(# update the gap)'

replacement3 = r'''\1
                
                # Add to all_scheduled_tasks to prevent future overlaps
                all_scheduled_tasks.append({
                    'start_time': start_time,
                    'end_time': end_time
                })

                \2'''

new_content = re.sub(pattern3, replacement3, new_content, flags=re.DOTALL)

if new_content != content:
    # Backup first
    import shutil
    shutil.copy(file_path, file_path + '.backup')
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("✓ Fixed planner.py - added overlap prevention for floating tasks")
    print("✓ Backup saved as planner.py.backup")
else:
    print("✗ Pattern not found - file may have different structure")
