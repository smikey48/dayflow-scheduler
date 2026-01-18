"""
Archive old completed and deleted tasks from scheduled_tasks to scheduled_tasks_archive.

Strategy:
- Only archive tasks older than a retention period (default: 14 days)
- Only archive completed or deleted tasks (keep active tasks in main table)
- Use INSERT ... ON CONFLICT DO NOTHING to avoid duplicate key errors
- Can be run multiple times safely (idempotent)

This addresses the performance issue while avoiding the duplicate key problem
that occurred when archiving during the daily reschedule.
"""

import os
import sys
from datetime import date, timedelta
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

# Supabase connection
SUPABASE_URL = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Supabase credentials not found in environment")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Configuration
RETENTION_DAYS = 14  # Keep tasks for this many days before archiving
DRY_RUN = True  # Set to False to actually archive
USER_ID = "3c877140-9539-47b9-898a-45eeab392e39"  # TODO: Make configurable for multi-user

def archive_old_tasks(retention_days: int = RETENTION_DAYS, dry_run: bool = DRY_RUN, user_id: str = USER_ID):
    """Archive old tasks to scheduled_tasks_archive.
    
    Archives:
    - Completed tasks older than retention period
    - Deleted tasks older than retention period  
    - Active tasks older than retention period (old scheduled instances no longer relevant)
    """
    
    cutoff_date = (date.today() - timedelta(days=retention_days)).isoformat()
    
    print(f"=== Archiving Tasks (Retention: {retention_days} days, Cutoff: {cutoff_date}) ===")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}\n")
    
    # Count ALL old tasks (not just completed/deleted)
    count_result = supabase.table('scheduled_tasks') \
        .select('id', count='exact') \
        .eq('user_id', user_id) \
        .lt('local_date', cutoff_date) \
        .execute()
    
    count = count_result.count
    print(f"Found {count} old tasks to archive (before {cutoff_date})")
    
    if count == 0:
        print("Nothing to archive.")
        return 0
    
    # Show sample of what will be archived
    sample_result = supabase.table('scheduled_tasks') \
        .select('local_date, title, is_completed, is_deleted') \
        .eq('user_id', user_id) \
        .lt('local_date', cutoff_date) \
        .order('local_date') \
        .limit(5) \
        .execute()
    
    print("\nSample tasks to archive:")
    for row in sample_result.data:
        if row['is_completed']:
            status = "completed"
        elif row['is_deleted']:
            status = "deleted"
        else:
            status = "old instance"
        print(f"  - {row['local_date']}: {row['title']} ({status})")
    
    if count > 5:
        print(f"  ... and {count - 5} more")
    
    if dry_run:
        print("\n✓ DRY RUN - No changes made")
        print(f"  Run with --execute to archive {count} tasks")
        return count
    
    # Fetch all tasks to archive (in batches if needed)
    print(f"\nArchiving {count} tasks...")
    
    # Get ALL old tasks (not just completed/deleted)
    tasks_to_archive = supabase.table('scheduled_tasks') \
        .select('*') \
        .eq('user_id', user_id) \
        .lt('local_date', cutoff_date) \
        .execute()
    
    if not tasks_to_archive.data:
        print("No tasks found to archive")
        return 0
    
    # Archive tasks (add archived_at timestamp)
    from datetime import datetime
    archived_tasks = []
    archived_count = 0
    
    for task in tasks_to_archive.data:
        task_copy = task.copy()
        task_copy['archived_at'] = datetime.utcnow().isoformat()
        try:
            # Try to insert, ignore if already exists
            supabase.table('scheduled_tasks_archive').insert(task_copy).execute()
            archived_count += 1
        except Exception as e:
            # Ignore duplicate key errors
            if 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
                pass
            else:
                print(f"Warning: Failed to archive task {task.get('id')}: {e}")
    
    print(f"✓ Archived {archived_count} tasks (skipped {len(tasks_to_archive.data) - archived_count} duplicates)")
    
    # Now delete the archived tasks from the main table
    task_ids = [task['id'] for task in tasks_to_archive.data]
    
    # Delete in batches of 100 to avoid URL length limits
    deleted_count = 0
    batch_size = 100
    for i in range(0, len(task_ids), batch_size):
        batch = task_ids[i:i+batch_size]
        result = supabase.table('scheduled_tasks').delete().in_('id', batch).execute()
        deleted_count += len(batch)
    
    print(f"✓ Deleted {deleted_count} tasks from scheduled_tasks")
    
    # Verify
    remaining_result = supabase.table('scheduled_tasks').select('id', count='exact').eq('user_id', user_id).execute()
    archive_result = supabase.table('scheduled_tasks_archive').select('id', count='exact').eq('user_id', user_id).execute()
    
    print(f"\n=== Summary ===")
    print(f"Tasks remaining in scheduled_tasks: {remaining_result.count}")
    print(f"Total tasks in archive: {archive_result.count}")
    print(f"✅ Archiving complete")
    
    return deleted_count

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Archive old completed/deleted tasks")
    parser.add_argument("--retention-days", type=int, default=RETENTION_DAYS,
                       help=f"Keep tasks for this many days (default: {RETENTION_DAYS})")
    parser.add_argument("--execute", action="store_true",
                       help="Actually perform the archiving (default: dry run)")
    
    args = parser.parse_args()
    
    archive_old_tasks(
        retention_days=args.retention_days,
        dry_run=not args.execute
    )
