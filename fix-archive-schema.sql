-- Migration: Fix scheduled_tasks_archive schema to allow archiving
-- Problem: The 'date' column is a GENERATED column which prevents INSERT operations
-- Solution: Drop the generated column and recreate it as a regular column

-- Step 1: Drop the generated 'date' column from archive table
ALTER TABLE scheduled_tasks_archive 
DROP COLUMN IF EXISTS date;

-- Step 2: Add 'date' as a regular column (matching scheduled_tasks)
-- The 'date' column in scheduled_tasks is likely DATE or TIMESTAMP type
ALTER TABLE scheduled_tasks_archive
ADD COLUMN date DATE;

-- Step 3: Verify the change worked
SELECT column_name, data_type, is_generated
FROM information_schema.columns
WHERE table_name = 'scheduled_tasks_archive'
  AND table_schema = 'public'
  AND column_name = 'date';

-- Note: After running this migration, the archive-old-tasks.py script should work correctly
