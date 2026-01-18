# Automatic Task Archiving Solution

## Problem
The `scheduled_tasks` table was growing too large (1,241 rows), affecting performance. The `scheduled_tasks_archive` table had a schema incompatibility that prevented automatic archiving.

## Root Cause
The `date` column in `scheduled_tasks_archive` was defined as a GENERATED column, which prevents INSERT operations with explicit values.

## Solution

### 1. Fix Archive Table Schema

Run this SQL in your Supabase SQL Editor:

```sql
-- Drop the generated 'date' column
ALTER TABLE scheduled_tasks_archive 
DROP COLUMN IF EXISTS date;

-- Add 'date' as a regular column to match scheduled_tasks
ALTER TABLE scheduled_tasks_archive 
ADD COLUMN date DATE;
```

### 2. Test the Fix

```bash
python apply-archive-fix.py
```

This will verify the schema fix worked correctly.

### 3. Run Archiving

```bash
# Dry run (see what would be archived)
python archive-old-tasks.py

# Actually archive old tasks
python archive-old-tasks.py --execute

# Custom retention period (e.g., 30 days)
python archive-old-tasks.py --retention-days 30 --execute
```

## Archiving Policy

**What gets archived:**
- Completed tasks older than 14 days (configurable)
- Deleted/skipped tasks older than 14 days

**What stays in scheduled_tasks:**
- All active (incomplete, not deleted) tasks
- Recent completed/deleted tasks (within retention period)

## Automation

To run archiving automatically, add a scheduled task to Railway:

1. Create a new file: `archive-cron.py`
```python
from archive_old_tasks import archive_old_tasks

if __name__ == "__main__":
    # Run weekly archiving with 14-day retention
    archive_old_tasks(retention_days=14, dry_run=False)
```

2. Add to Railway Cron or run monthly as maintenance

## Performance Impact

Initial cleanup:
- Reduced table from 1,241 to 732 rows (41% reduction)
- Archived 509 old tasks

Expected ongoing impact:
- Keep table size manageable (<1000 rows)
- Faster queries on scheduled_tasks
- Historical data preserved in archive table

## Files

- `fix-archive-schema.sql` - SQL migration to fix archive table
- `apply-archive-fix.py` - Test script to verify schema fix
- `archive-old-tasks.py` - Main archiving script
- `analyze-scheduled-tasks-size.py` - Check current table size
