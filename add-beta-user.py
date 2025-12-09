"""
Add email addresses to the beta users allowlist.
Run this script to grant beta access to new users.

Usage:
    python add-beta-user.py user@example.com
    python add-beta-user.py user1@example.com user2@example.com "Optional notes"
"""

import sys
import os
from supabase import create_client, Client

def add_beta_user(email: str, notes: str = None):
    """Add an email to the beta users allowlist."""
    
    # Get Supabase credentials
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables")
        print("Set them in your environment or .env file")
        sys.exit(1)
    
    # Create Supabase client
    supabase: Client = create_client(url, key)
    
    try:
        # Insert the beta user
        data = {
            "email": email.lower(),
            "notes": notes
        }
        
        result = supabase.table("beta_users").insert(data).execute()
        
        print(f"✅ Added {email} to beta allowlist")
        if notes:
            print(f"   Notes: {notes}")
        
        return True
        
    except Exception as e:
        error_msg = str(e)
        if "duplicate key" in error_msg.lower():
            print(f"⚠️  {email} is already on the beta allowlist")
        else:
            print(f"❌ Error adding {email}: {error_msg}")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python add-beta-user.py <email> [email2] [email3] [notes]")
        print("\nExamples:")
        print("  python add-beta-user.py friend@example.com")
        print("  python add-beta-user.py user1@example.com user2@example.com")
        print('  python add-beta-user.py friend@example.com "Invited by John"')
        sys.exit(1)
    
    # All args are emails except potentially the last one which might be notes
    args = sys.argv[1:]
    emails = []
    notes = None
    
    # If last arg doesn't look like an email, treat it as notes
    if args and '@' not in args[-1]:
        notes = args[-1]
        emails = args[:-1]
    else:
        emails = args
    
    if not emails:
        print("ERROR: Please provide at least one email address")
        sys.exit(1)
    
    print(f"\nAdding {len(emails)} email(s) to beta allowlist...\n")
    
    success_count = 0
    for email in emails:
        if '@' not in email:
            print(f"⚠️  Skipping invalid email: {email}")
            continue
            
        if add_beta_user(email, notes):
            success_count += 1
    
    print(f"\n✨ Successfully added {success_count}/{len(emails)} email(s)")

if __name__ == "__main__":
    main()
