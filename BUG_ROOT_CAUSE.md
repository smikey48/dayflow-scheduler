# Root Cause Analysis: Automatic Task Deletions

## THE BUG

**Found in**: [app/today/page.tsx](app/today/page.tsx#L874-L884)

### The Problem

When users open the Today page, it automatically re-runs the scheduler if:
1. No tasks exist for today, OR
2. **Task count < 5**, OR ← **THIS WAS THE BUG**
3. There are floating tasks without time slots

The scheduler's deletion logic (`archive_delete_for_user_day()`) **deletes all incomplete, non-deleted tasks** before creating the schedule. This caused legitimate tasks to be deleted and not recreated.

### How It Happened

**Scenario 1: Tasks deleted 20-34 seconds after creation**
1. 08:46 AM - Automated scheduler creates tasks (e.g., "Check sewers", "Book Mahjong")
2. 08:46:20-46 AM - User opens Today page
3. Page sees taskCount < 5 (or some other triggering condition)
4. **Page calls scheduler again**
5. Scheduler deletes all incomplete tasks (including the one just created)
6. Scheduler attempts to recreate schedule
7. **BUG**: If planner logic has a bug or doesn't recognize a task should exist, it doesn't recreate it
8. Result: Task is deleted but not recreated

**Scenario 2: Carried-forward tasks disappearing**
1. Day 1 (Jan 5) - "Check sewers" is created, user doesn't complete it
2. Day 2 (Jan 6) - Morning scheduler carries forward "Check sewers"
3. User opens Today page later
4. Page sees only carried-forward task (taskCount < 5)
5. **Page re-runs scheduler**
6. Scheduler deletes carried-forward task
7. Planner doesn't know it should be carried forward (that already happened)
8. Result: Carried-forward task disappears

## THE FIX

**Removed the aggressive `taskCount < 5` condition** from page load scheduler trigger.

Now the scheduler only re-runs on page load if:
- No tasks exist for today (taskCount === 0), OR
- Floating tasks need time slots assigned

This prevents unnecessary re-scheduling that was deleting legitimate tasks.

## Evidence

From `audit-deleted-instances.py`:

```
📅 2025-12-31: Fix immersion in No 3
   Created:  2025-12-31T08:49:12.677719+00:00
   Updated:  2025-12-31T08:49:47.332103+00:00
   Deleted after: 0:00:34.654384  ← 34 seconds!

📅 2025-12-30: Book Mahjong
   Created:  2025-12-30T08:26:09.899897+00:00
   Updated:  2025-12-30T08:26:30.054201+00:00
   Deleted after: 0:00:20.154304  ← 20 seconds!
```

These deletion times (20-34 seconds) match the pattern of:
1. Morning scheduler creates task
2. User opens page immediately after
3. Page triggers scheduler re-run
4. Task gets deleted

## Files Changed

- `app/today/page.tsx` (lines 873-894): Removed `taskCount < 5` condition

## Additional Recommendations

1. **Add rate limiting** to prevent scheduler from running multiple times in short succession
2. **Add better logging** to track when and why scheduler is triggered
3. **Improve carry-forward logic** to be more robust against re-scheduling
4. **Consider adding a flag** to prevent scheduler deletion of carried-forward tasks

## Related Issues

- "Pay Bills" task had `is_deleted: TRUE` (likely from same bug)
- "Check sewers" carried forward task disappeared (this exact scenario)
