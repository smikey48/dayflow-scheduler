-- DAYFLOW 404 FIX - Run these 2 SQL scripts in Supabase dashboard
-- Go to: https://supabase.com/dashboard/project/PROJECT_ID/sql/new
-- Or copy each script into the SQL editor and click "Run"

-- ============================================================
-- SCRIPT 1: Enable RLS on users table and add policies
-- ============================================================
-- This allows new users to read and update their own profile
-- This also allows the trigger (service role) to create new user records
-- Run this FIRST

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Service role can insert new users" ON public.users;

CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow service role to insert new user records (for trigger)
CREATE POLICY "Service role can insert new users"
  ON public.users FOR INSERT
  WITH CHECK (true);


-- ============================================================
-- SCRIPT 2: Update user creation trigger
-- ============================================================
-- This ensures new users have has_seen_intro and has_accepted_disclaimer
-- set to FALSE immediately when their account is created
-- Run this SECOND

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


-- ============================================================
-- VERIFICATION (optional - just to confirm it worked)
-- ============================================================
-- After running the above scripts, you can run this to verify:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'users';
-- Result should show: users | t (where 't' means RLS is enabled)
