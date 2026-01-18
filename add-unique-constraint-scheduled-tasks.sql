-- Unique constraint already exists as 'uq_sched_user_day_template'
-- This constraint SHOULD prevent duplicates with same (user_id, local_date, template_id)

-- Check if we have ACTUAL constraint violations (duplicates with same template_id on same day):
SELECT 
  user_id,
  local_date,
  template_id,
  title,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as all_ids,
  STRING_AGG((start_time AT TIME ZONE 'Europe/London')::text, ', ') as all_times
FROM scheduled_tasks
WHERE local_date = CURRENT_DATE
  AND is_completed = FALSE
  AND is_deleted = FALSE
GROUP BY user_id, local_date, template_id, title
HAVING COUNT(*) > 1;

-- Find all Ocado entries for today with ALL fields:
SELECT 
  id,
  user_id,
  template_id,
  title,
  start_time AT TIME ZONE 'Europe/London' as start_time_london,
  is_completed,
  is_deleted,
  created_at
FROM scheduled_tasks
WHERE title ILIKE '%ocado%'
  AND local_date = CURRENT_DATE
ORDER BY is_completed, created_at;

-- Show which template_ids are being used:
SELECT 
  template_id,
  COUNT(*) as count,
  MIN(start_time AT TIME ZONE 'Europe/London') as earliest_time,
  MAX(start_time AT TIME ZONE 'Europe/London') as latest_time
FROM scheduled_tasks
WHERE title ILIKE '%ocado%'
  AND local_date = CURRENT_DATE
  AND is_completed = FALSE
  AND is_deleted = FALSE
GROUP BY template_id;

-- To fix: Keep only the one with correct time (20:00) and delete the rest
-- First verify which one has 20:00:
-- SELECT id, template_id, start_time AT TIME ZONE 'Europe/London' as time
-- FROM scheduled_tasks
-- WHERE title ILIKE '%ocado%'
--   AND local_date = CURRENT_DATE
--   AND EXTRACT(HOUR FROM start_time AT TIME ZONE 'Europe/London') = 20;

-- Then delete all others:
-- DELETE FROM scheduled_tasks
-- WHERE title ILIKE '%ocado%'
--   AND local_date = CURRENT_DATE
--   AND is_completed = FALSE
--   AND is_deleted = FALSE
--   AND id NOT IN (
--     SELECT id FROM scheduled_tasks
--     WHERE title ILIKE '%ocado%'
--       AND local_date = CURRENT_DATE
--       AND EXTRACT(HOUR FROM start_time AT TIME ZONE 'Europe/London') = 20
--     LIMIT 1
--   );

-- MAINTENANCE: Clean up old completed tasks (optional - only if you don't want history)
-- This keeps completed tasks for 7 days, then deletes them:
-- DELETE FROM scheduled_tasks
-- WHERE is_completed = TRUE
--   AND local_date < CURRENT_DATE - INTERVAL '7 days';
