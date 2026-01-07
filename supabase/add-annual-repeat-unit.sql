-- Add 'annual' to the task_repeat_unit enum type
-- Run this in your Supabase SQL Editor

-- Add 'annual' as a new value to the enum
ALTER TYPE task_repeat_unit ADD VALUE IF NOT EXISTS 'annual';

-- Verify the change
-- SELECT enum_range(NULL::task_repeat_unit);
