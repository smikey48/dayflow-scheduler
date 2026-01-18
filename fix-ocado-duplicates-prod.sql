-- Run this in your Supabase SQL editor to clean up Ocado duplicates
-- Replace YOUR_USER_ID with the actual user ID

-- First, see what we have
SELECT 
  id,
  local_date,
  template_id,
  start_time AT TIME ZONE 'Europe/London' as start_time_london,
  is_completed,
  is_deleted
FROM scheduled_tasks
WHERE user_id = 'YOUR_USER_ID'
  AND title ILIKE '%ocado%'
  AND local_date = CURRENT_DATE
ORDER BY is_completed, start_time;

-- Then delete all but the one with the correct time (or the most recent one)
-- Keep only the row with start_time you want (20:00 London time)
-- DELETE FROM scheduled_tasks
-- WHERE id IN (
--   SELECT id 
--   FROM scheduled_tasks
--   WHERE user_id = 'YOUR_USER_ID'
--     AND title ILIKE '%ocado%'
--     AND local_date = CURRENT_DATE
--     AND is_completed = FALSE
--     AND is_deleted = FALSE
--   ORDER BY created_at DESC
--   OFFSET 1  -- Keep the first (most recent), delete the rest
-- );
