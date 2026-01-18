"""
Check if a user account exists in Supabase Auth
Usage: python check-user-account.py email@example.com
"""

import sys
import os
from supabase import create_client, Client

if len(sys.argv) < 2:
    print("Usage: python check-user-account.py email@example.com")
    sys.exit(1)

email = sys.argv[1].lower()

# Get Supabase credentials
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    sys.exit(1)

supabase: Client = create_client(url, key)

# Check beta_users table
print(f"Checking beta access for: {email}")
try:
    beta_result = supabase.table("beta_users").select("*").eq("email", email).execute()
    if beta_result.data:
        print(f"✅ Email IS in beta_users table")
        print(f"   Added: {beta_result.data[0].get('created_at', 'N/A')}")
    else:
        print(f"❌ Email NOT in beta_users table")
except Exception as e:
    print(f"❌ Error checking beta_users: {e}")

# Check auth.users (requires service role key)
print(f"\nChecking Supabase Auth for: {email}")
try:
    # Use admin API to list users
    response = supabase.auth.admin.list_users()
    users = [u for u in response if u.email and u.email.lower() == email]
    
    if users:
        user = users[0]
        print(f"✅ Auth account EXISTS")
        print(f"   User ID: {user.id}")
        print(f"   Created: {user.created_at}")
        print(f"   Email confirmed: {user.email_confirmed_at is not None}")
        print(f"   Last sign in: {user.last_sign_in_at or 'Never'}")
    else:
        print(f"❌ NO Auth account found - user needs to SIGN UP first!")
except Exception as e:
    print(f"❌ Error checking auth: {e}")
