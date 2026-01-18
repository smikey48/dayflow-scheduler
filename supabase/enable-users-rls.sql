-- Enable RLS on users table and add policy for users to read their own record
-- This ensures each user can only read/write their own user profile

-- Enable RLS on the users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy: Service role can always read (for administrative operations)
-- Note: Service role bypasses RLS by default, but this is explicit for clarity
-- This allows the scheduler and other service operations to function

-- Optional: Policy to allow anon key to read public profile info (if needed)
-- CREATE POLICY "Public profiles are viewable by everyone"
--   ON public.users FOR SELECT
--   USING (true);
