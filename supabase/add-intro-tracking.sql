-- Add updated_at field if it doesn't exist (needed by trigger)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add has_seen_intro field to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS has_seen_intro BOOLEAN DEFAULT FALSE;

-- Set existing users as having seen the intro (so they don't get redirected)
UPDATE public.users 
SET has_seen_intro = TRUE 
WHERE has_seen_intro IS NULL OR has_seen_intro = FALSE;
