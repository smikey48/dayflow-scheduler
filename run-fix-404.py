#!/usr/bin/env python3
"""
Run SQL scripts to fix the user initialization issue using raw PostgreSQL connection
"""
import os
import sys
from dotenv import load_dotenv

# Load environment from .env.local
load_dotenv('.env.local')

url = os.getenv('SUPABASE_URL')
service_key = os.getenv('SUPABASE_SERVICE_KEY')

if not url or not service_key:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    sys.exit(1)

# Extract connection info from Supabase URL
# Format: https://PROJECT_ID.supabase.co
project_id = url.replace('https://', '').replace('.supabase.co', '')

# Construct PostgreSQL connection string
db_host = f"{project_id}.db.supabase.co"
db_user = "postgres"
db_password = service_key
db_name = "postgres"

print("=" * 70)
print("Running SQL fixes for user initialization 404 issue")
print("=" * 70)

try:
    import psycopg2
    from psycopg2.errors import Error as PgError
except ImportError:
    print("\n❌ psycopg2 not installed. Installing...")
    os.system(f"{sys.executable} -m pip install psycopg2-binary")
    import psycopg2
    from psycopg2.errors import Error as PgError

# Try to connect and execute SQL
try:
    # Connect to Supabase PostgreSQL
    conn = psycopg2.connect(
        host=db_host,
        port=5432,
        user=db_user,
        password=db_password,
        database=db_name,
        sslmode='require'
    )
    
    cursor = conn.cursor()
    
    print("\n✓ Connected to Supabase database")
    
    # Script 1: Enable RLS on users table
    print("\n[1/3] Enabling RLS on users table...")
    cursor.execute("ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;")
    print("  ✓ RLS enabled")
    
    # Script 2: Create RLS policies
    print("\n[2/3] Creating RLS policies for users table...")
    
    cursor.execute("DROP POLICY IF EXISTS \"Users can view own profile\" ON public.users;")
    cursor.execute("DROP POLICY IF EXISTS \"Users can update own profile\" ON public.users;")
    print("  ✓ Old policies dropped")
    
    cursor.execute("""
        CREATE POLICY "Users can view own profile"
          ON public.users FOR SELECT
          USING (auth.uid() = id);
    """)
    print("  ✓ SELECT policy created")
    
    cursor.execute("""
        CREATE POLICY "Users can update own profile"
          ON public.users FOR UPDATE
          USING (auth.uid() = id)
          WITH CHECK (auth.uid() = id);
    """)
    print("  ✓ UPDATE policy created")
    
    # Script 3: Update the trigger
    print("\n[3/3] Updating user creation trigger...")
    
    cursor.execute("""
        CREATE OR REPLACE FUNCTION public.handle_new_user()
        RETURNS trigger AS $$
        BEGIN
          INSERT INTO public.users (id, email, full_name, created_at, has_seen_intro, has_accepted_disclaimer)
          VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
            NEW.created_at,
            FALSE,
            FALSE
          );
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
    """)
    print("  ✓ Trigger updated to set has_seen_intro and has_accepted_disclaimer")
    
    # Commit all changes
    conn.commit()
    cursor.close()
    conn.close()
    
    print("\n" + "=" * 70)
    print("✅ All SQL fixes have been successfully applied!")
    print("=" * 70)
    print("\n📝 Changes made:")
    print("  1. Enabled RLS on users table")
    print("  2. Added policy allowing users to read their own profile")
    print("  3. Added policy allowing users to update their own profile")
    print("  4. Updated trigger to set has_seen_intro=FALSE for new users")
    print("  5. Updated trigger to set has_accepted_disclaimer=FALSE for new users")
    print("\n✨ Your daughter can now:")
    print("  1. Log in to the production DayFlow app")
    print("  2. She will see the intro page instead of 404")
    print("  3. Complete the intro and start using DayFlow")
    
except (Exception, PgError) as error:
    print(f"\n❌ Error: {error}")
    sys.exit(1)
