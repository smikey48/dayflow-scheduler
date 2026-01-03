-- Add has_accepted_disclaimer field to users table
-- This tracks whether a user has accepted the beta testing disclaimer

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS has_accepted_disclaimer BOOLEAN DEFAULT FALSE;

-- Update existing users to not have accepted (they'll need to accept on next login)
UPDATE public.users 
SET has_accepted_disclaimer = FALSE 
WHERE has_accepted_disclaimer IS NULL;

-- Add a comment to document the field
COMMENT ON COLUMN public.users.has_accepted_disclaimer IS 
'Tracks whether the user has accepted the beta testing disclaimer and terms';
