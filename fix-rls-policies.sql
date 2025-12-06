-- Fix RLS Policies for DayFlow Multi-User
-- This script drops all existing policies and creates correct ones

-- ========================================
-- PART 1: Drop all existing policies
-- ========================================

-- Drop scheduled_tasks policies
DROP POLICY IF EXISTS "scheduled_delete" ON scheduled_tasks;
DROP POLICY IF EXISTS "scheduled_insert" ON scheduled_tasks;
DROP POLICY IF EXISTS "scheduled_select" ON scheduled_tasks;
DROP POLICY IF EXISTS "scheduled_update" ON scheduled_tasks;

-- Drop task_templates policies
DROP POLICY IF EXISTS "task_temp_delete" ON task_templates;
DROP POLICY IF EXISTS "task_temp_insert" ON task_templates;
DROP POLICY IF EXISTS "task_temp_select" ON task_templates;
DROP POLICY IF EXISTS "task_temp_update" ON task_templates;

-- Drop voice_jobs policies
DROP POLICY IF EXISTS "vj_insert_check" ON voice_jobs;
DROP POLICY IF EXISTS "vj_update" ON voice_jobs;
DROP POLICY IF EXISTS "voice_jobs_insert" ON voice_jobs;
DROP POLICY IF EXISTS "voice_jobs_select" ON voice_jobs;
DROP POLICY IF EXISTS "voice_jobs_update" ON voice_jobs;

-- Drop scheduled_tasks_archive policies (if any)
DROP POLICY IF EXISTS "archive_select" ON scheduled_tasks_archive;
DROP POLICY IF EXISTS "archive_insert" ON scheduled_tasks_archive;

-- ========================================
-- PART 2: Create correct policies
-- ========================================

-- ----------------------------------------
-- task_templates policies
-- ----------------------------------------

CREATE POLICY "task_templates_select"
  ON task_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "task_templates_insert"
  ON task_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "task_templates_update"
  ON task_templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "task_templates_delete"
  ON task_templates FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------
-- scheduled_tasks policies
-- ----------------------------------------

CREATE POLICY "scheduled_tasks_select"
  ON scheduled_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "scheduled_tasks_insert"
  ON scheduled_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "scheduled_tasks_update"
  ON scheduled_tasks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "scheduled_tasks_delete"
  ON scheduled_tasks FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------
-- scheduled_tasks_archive policies
-- ----------------------------------------

CREATE POLICY "scheduled_tasks_archive_select"
  ON scheduled_tasks_archive FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "scheduled_tasks_archive_insert"
  ON scheduled_tasks_archive FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------
-- voice_jobs policies
-- ----------------------------------------

CREATE POLICY "voice_jobs_select"
  ON voice_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "voice_jobs_insert"
  ON voice_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "voice_jobs_update"
  ON voice_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "voice_jobs_delete"
  ON voice_jobs FOR DELETE
  USING (auth.uid() = user_id);

-- ========================================
-- PART 3: Verify RLS is enabled
-- ========================================

-- Enable RLS on all tables (idempotent - safe to run even if already enabled)
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_tasks_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_jobs ENABLE ROW LEVEL SECURITY;

-- ========================================
-- VERIFICATION QUERY
-- ========================================
-- Run this after to confirm all policies are correct:
-- 
-- SELECT tablename, policyname, cmd as command, 
--        qual as using_expr, with_check as check_expr
-- FROM pg_policies 
-- WHERE schemaname = 'public' 
--   AND tablename IN ('task_templates', 'scheduled_tasks', 
--                     'scheduled_tasks_archive', 'voice_jobs')
-- ORDER BY tablename, cmd, policyname;
