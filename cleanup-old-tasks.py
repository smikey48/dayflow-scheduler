"""
Clean up old completed and deleted tasks from scheduled_tasks.

Since the archive table has schema incompatibilities, this script simply deletes
old tasks to keep the table size manageable. Completed tasks are kept for a retention
period so users can see their history, then deleted.

Run this weekly or monthly as maintenance.
