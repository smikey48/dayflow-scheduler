import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')

SUPABASE_URL = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

USER_ID = '3c877140-9539-47b9-898a-45eeab392e39'
TEMPLATE_ID = 'e6b75c4d-c03a-4b93-ab74-caf51979e985'

print("=== Updating ADHD Interview Template ===\n")

# Update the template's reference date to match the moved appointment
response = supabase.table('task_templates').update({
    'date': '2026-02-06'
}).eq('id', TEMPLATE_ID).execute()

print("Template updated!")
print(f"New reference date: 2026-02-06")

# Verify
template = supabase.table('task_templates').select('*').eq('id', TEMPLATE_ID).execute()
if template.data:
    t = template.data[0]
    print(f"\nVerified:")
    print(f"  Title: {t['title']}")
    print(f"  Date: {t.get('date')}")
    print(f"  Local date: {t.get('local_date')}")
