-- Check the schema of both tables to identify differences

-- Current scheduled_tasks schema
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    is_generated
FROM information_schema.columns
WHERE table_name = 'scheduled_tasks'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Current scheduled_tasks_archive schema
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    is_generated
FROM information_schema.columns
WHERE table_name = 'scheduled_tasks_archive'
  AND table_schema = 'public'
ORDER BY ordinal_position;
