-- Create beta_users table for managing closed beta access
CREATE TABLE IF NOT EXISTS public.beta_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    invited_by TEXT,
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.beta_users ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read (needed for sign-up validation)
-- In production, you might want to restrict this further
CREATE POLICY "Allow public read access for signup validation"
    ON public.beta_users
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Policy: Only service role can insert/update/delete
CREATE POLICY "Only service role can modify beta users"
    ON public.beta_users
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Add some initial beta users (replace with your actual email addresses)
INSERT INTO public.beta_users (email, notes) VALUES
    ('your-email@example.com', 'Admin/Owner')
ON CONFLICT (email) DO NOTHING;

-- Create index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_beta_users_email ON public.beta_users(email);
