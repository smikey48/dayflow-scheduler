-- Query to show all RLS policies for DayFlow tables

-- Check if RLS is enabled on each table
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
    AND tablename IN (
        'task_templates',
        'scheduled_tasks', 
        'scheduled_tasks_archive',
        'voice_jobs'
    )
ORDER BY tablename;

-- Show all policies for these tables
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd as command,
    qual as using_expression,
    with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename IN (
        'task_templates',
        'scheduled_tasks',
        'scheduled_tasks_archive', 
        'voice_jobs'
    )
ORDER BY tablename, policyname;
