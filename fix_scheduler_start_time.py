import re

file_path = r'C:\Projects\dayflow-scheduler\dayflow\scheduler_main.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace the day_start logic
pattern = r'(# 2\) Day bounds.*?)\n    day_start = datetime\.combine\(run_date, time\(8, 0\), tzinfo=LONDON\)\n    day_end = datetime\.combine\(run_date, time\(23, 0\), tzinfo=LONDON\)'

replacement = r'''\1
    now_time = datetime.now(LONDON)
    if args.force and now_time.date() == run_date and now_time.time() > time(8, 0):
        # When forcing a reschedule during the day, start from current time
        day_start = now_time
        logging.info("Force mode: starting schedule from current time %s", day_start.strftime("%H:%M"))
    else:
        day_start = datetime.combine(run_date, time(8, 0), tzinfo=LONDON)
    day_end = datetime.combine(run_date, time(23, 0), tzinfo=LONDON)'''

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

if new_content != content:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("✓ Fixed scheduler_main.py - added current-time logic for --force mode")
else:
    print("✗ Pattern not found - file may have already been modified")
