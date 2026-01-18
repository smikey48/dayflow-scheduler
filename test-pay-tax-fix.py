import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import date

load_dotenv('.env.local')

url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
supabase = create_client(url, key)

template_id = "cc517de9-6836-40ab-a03e-daa7b68bc1b5"
user_id = "3c877140-9539-47b9-898a-45eeab392e39"
today = date.today().isoformat()

print("=== Step 1: Delete incorrectly scheduled instance from today ===")
delete_result = supabase.table('scheduled_tasks').delete().eq('template_id', template_id).eq('local_date', today).execute()
print(f"✅ Deleted {len(delete_result.data) if delete_result.data else 0} scheduled task(s) for {today}")

print("\n=== Step 2: Test the scheduler with the fix ===")
print("Running scheduler to verify PAY TAX BILL is NOT scheduled for today...")

import sys
sys.path.insert(0, r'C:\Projects\dayflow-scheduler')

from dayflow.planner import preprocess_recurring_tasks

# Run the preprocessing to see what would be scheduled
instances = preprocess_recurring_tasks(run_date=date.today(), supabase=supabase, user_id=user_id)

# Check if PAY TAX BILL appears in the instances
pay_tax_instances = [inst for inst in instances if 'PAY TAX' in inst.get('title', '').upper()]

if pay_tax_instances:
    print("❌ FAIL: PAY TAX BILL still appears in today's schedule!")
    for inst in pay_tax_instances:
        print(f"   Title: {inst.get('title')}")
        print(f"   Date: {inst.get('date')}")
else:
    print("✅ SUCCESS: PAY TAX BILL is NOT in today's schedule")

print(f"\n=== Step 3: Verify it will appear on July 1, 2026 ===")
from datetime import datetime
july_first = datetime(2026, 7, 1).date()
instances_july = preprocess_recurring_tasks(run_date=july_first, supabase=supabase, user_id=user_id)

pay_tax_july = [inst for inst in instances_july if 'PAY TAX' in inst.get('title', '').upper()]

if pay_tax_july:
    print("✅ SUCCESS: PAY TAX BILL WILL appear on July 1, 2026")
    for inst in pay_tax_july:
        print(f"   Title: {inst.get('title')}")
        print(f"   Date: {inst.get('date')}")
else:
    print("❌ FAIL: PAY TAX BILL does not appear on July 1, 2026")
