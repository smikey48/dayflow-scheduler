import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

# Update the defer date
result = supabase.table('task_templates').update({
    'date': '2025-12-28'
}).eq('id', '068ff515-1551-43f5-acbd-1051a8c84ad5').execute()

print('Updated defer date to 2025-12-28')
print(f'Rows updated: {len(result.data)}')
