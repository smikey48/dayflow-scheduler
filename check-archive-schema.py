import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
supabase = create_client(url, key)

print("=== Checking schema differences ===\n")

# Check scheduled_tasks
print("Columns in scheduled_tasks:")
st_sample = supabase.table('scheduled_tasks').select('*').limit(1).execute()
if st_sample.data:
    for col in sorted(st_sample.data[0].keys()):
        print(f"  - {col}")

print("\nColumns in scheduled_tasks_archive:")
arch_sample = supabase.table('scheduled_tasks_archive').select('*').limit(1).execute()
if arch_sample.data:
    for col in sorted(arch_sample.data[0].keys()):
        print(f"  - {col}")
else:
    print("  (checking without data...)")
    # Try to insert a dummy row to see what columns are expected
    print("\n  Unable to determine schema without sample data")

print("\n=== Issue ===")
print("The 'date' column in scheduled_tasks_archive is a GENERATED column")
print("We need to recreate the archive table to match scheduled_tasks schema")
