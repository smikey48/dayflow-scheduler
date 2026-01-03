import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

result = supabase.table('task_templates').select('id, title, date, repeat_unit').eq('user_id', '3c877140-9539-47b9-898a-45eeab392e39').eq('repeat_unit', 'none').not_.is_('date', 'null').execute()

print('Tasks with defer dates:')
for task in result.data:
    print(f"- {task['title']}: {task['date']}")
