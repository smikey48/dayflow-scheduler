"""Reset password for a Supabase user"""
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

sb = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
)

# First, list all users to find your email
print("Existing users:")
try:
    response = sb.auth.admin.list_users()
    users = response if isinstance(response, list) else response.users
    for i, user in enumerate(users, 1):
        print(f"{i}. {user.email} (ID: {user.id})")
except Exception as e:
    print(f"Error listing users: {e}")

print("\n" + "="*60)
user_num = input("Enter the number of the user (1, 2, etc.): ").strip()
new_password = input("Enter new password (min 6 characters): ").strip()

if len(new_password) < 6:
    print("Password must be at least 6 characters!")
    exit(1)

try:
    user_index = int(user_num) - 1
    selected_user = users[user_index]
    email = selected_user.email
    user_id = selected_user.id
    
    # Update user password using admin API with user_id
    sb.auth.admin.update_user_by_id(
        user_id,
        {"password": new_password}
    )
    print(f"\n✅ Password updated for {email}")
    print(f"You can now log in with:")
    print(f"  Email: {email}")
    print(f"  Password: {new_password}")
except Exception as e:
    print(f"\n❌ Error: {e}")
    print("\nTrying alternative method...")
    
    # Alternative: Create a new user if the above fails
    try:
        result = sb.auth.admin.create_user({
            "email": email,
            "password": new_password,
            "email_confirm": True
        })
        print(f"✅ Created new user: {email}")
    except Exception as e2:
        print(f"❌ Also failed: {e2}")
