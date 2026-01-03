#!/usr/bin/env python3
"""Fix the one-off task blocking logic"""

with open(r'c:\Projects\dayflow-scheduler\dayflow\planner.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the line with "used_mask = tasks_df["id"].isin(used_other_ids)"
for i, line in enumerate(lines):
    if 'used_mask = tasks_df["id"].isin(used_other_ids)' in line:
        print(f"Found used_mask at line {i+1}")
        print(f"Current: {line.strip()}")
        
        # Replace the problematic section
        # Start from the line with "one_off_mask"
        start_idx = i - 1  # one line before used_mask
        
        # Find the end (line with "blocked =")
        end_idx = None
        for j in range(i, min(i+20, len(lines))):
            if 'blocked = (' in lines[j] or 'blocked= (' in lines[j]:
                end_idx = j
                break
        
        if end_idx:
            print(f"Replacing lines {start_idx+1} to {end_idx+1}")
            
            # New lines
            new_lines = [
                '        one_off_mask = tasks_df["repeat_unit"].astype(str).str.lower().eq("none")\n',
                '        \n',
                '        # Block if: one-off AND (completed elsewhere OR has date field != today)\n',
                '        completed_mask = tasks_df["id"].isin(completed_other_ids)\n',
                '        \n',
                '        # Check if task has a date field that\'s not today\n',
                '        if "date" in tasks_df.columns:\n',
                '            date_not_today_mask = (\n',
                '                tasks_df["date"].notna() & \n',
                '                (tasks_df["date"].astype(str) != today_str)\n',
                '            )\n',
                '        else:\n',
                '            date_not_today_mask = pd.Series([False] * len(tasks_df), index=tasks_df.index)\n',
                '\n',
                '        # Block only if one-off AND (completed elsewhere OR date != today)\n',
                '        blocked = one_off_mask & (completed_mask | date_not_today_mask)\n'
            ]
            
            # Replace
            lines = lines[:start_idx] + new_lines + lines[end_idx+1:]
            
            # Write back
            with open(r'c:\Projects\dayflow-scheduler\dayflow\planner.py', 'w', encoding='utf-8') as f:
                f.writelines(lines)
            
            print("Fixed!")
        else:
            print("Could not find end of section")
        break
else:
    print("Could not find used_mask line")
