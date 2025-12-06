-- Insert user record for Jann (if a users/profiles table exists)
-- First check what table has the foreign key by running check-foreign-keys.sql
-- Then run ONE of these:

-- Option 1: If foreign key points to 'users' table:
INSERT INTO users (id, email, created_at)
VALUES ('d66e19e3-0ae0-4f39-aac0-c9cf650c9d17', 'jannrobinson@hotmail.com', NOW())
ON CONFLICT (id) DO NOTHING;

-- Option 2: If foreign key points to 'profiles' table:
INSERT INTO profiles (id, email, created_at)
VALUES ('d66e19e3-0ae0-4f39-aac0-c9cf650c9d17', 'jannrobinson@hotmail.com', NOW())
ON CONFLICT (id) DO NOTHING;

-- Option 3: If foreign key points to auth.users (which is the standard):
-- This shouldn't be the issue since Jann exists in auth.users
-- But if it is, you might need to drop and recreate the foreign key to point to auth.users:

-- ALTER TABLE task_templates 
-- DROP CONSTRAINT task_templates_user_id_fkey;

-- ALTER TABLE task_templates 
-- ADD CONSTRAINT task_templates_user_id_fkey 
-- FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
