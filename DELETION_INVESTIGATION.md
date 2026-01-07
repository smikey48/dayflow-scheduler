# Investigation Summary: Unintended Task Deletions

## Problem
Tasks are being marked `is_deleted: True` in the `scheduled_tasks` table without user action.

## Evidence

### Case 1: "Pay Bills" (Previously Fixed)
- Template had `is_deleted: TRUE` and `repeat_day: NULL`
- Fixed on Jan 6, 2026

### Case 2: "Check sewers" (Just Fixed)
- Instance for Jan 5, 2026 had `is_deleted: True`
- Created: 2026-01-05 08:46:11 (by scheduler)
- Marked deleted: Unknown time on Jan 5
- Restored: 2026-01-06 09:04:29

### Case 3: Recently Deleted Instances (Audit Results)
Tasks deleted suspiciously quickly after creation:
- "Book Mahjong" (Dec 30): Deleted 20 seconds after creation
- "Fix immersion in No 3" (Dec 31): Deleted 34 seconds after creation
- "Fix immersion in No 3" (Dec 30): Deleted 12 minutes after creation

Longer deletion times (likely manual):
- "Recycle" (Jan 5): Deleted 7 hours 25 minutes after creation
- "Therapy homework" (Jan 5): Deleted 5 hours 10 minutes after creation
- "Research and discuss new heart medicine" (Jan 1): Deleted 3 hours 56 minutes after creation

## Deletion Code Paths Found

### Frontend (TypeScript)
1. **app/today/page.tsx** (lines 621, 650, 663, 703, 731)
   - `deleteTask()` function
   - `completeSeries()` function (deletes template, not instances directly)

2. **app/components/Calendar.tsx** (lines 474, 485, 512, 569)
   - Task deletion from calendar view
   - Handles both instance and series deletion

3. **app/api/move-appointment/route.ts** (lines 118, 143)
   - Marks old date as deleted when moving appointments

### Backend (Python)
- **No code found** that sets `is_deleted: True` on scheduled_tasks
- Scheduler only **reads** the is_deleted flag to skip tasks
- Planner **preserves** deleted tasks during upserts

## Hypothesis

### Most Likely: Race Condition / Duplicate Detection
If tasks are being created multiple times (perhaps due to scheduler running twice or UI refreshing), there may be logic that deletes duplicates. Need to search for:
- Duplicate detection code
- Code that runs on page load/refresh
- Batch cleanup operations

### Less Likely: UI Bug
Accidental button clicks causing immediate deletions (20-34 seconds suggests quick user action after page load, but user denies this)

### Least Likely: Database Trigger
Could check for Supabase triggers/functions that auto-delete tasks

## Recommended Actions

1. **Add detailed audit logging** to all deletion code paths:
   - Log user_id, timestamp, stack trace
   - Log which function triggered the deletion
   
2. **Check for duplicate task handling**:
   - Search for code that detects/removes duplicate scheduled tasks
   - Review scheduler logic for race conditions

3. **Enable Supabase audit logs** (if available):
   - Track all updates to scheduled_tasks.is_deleted
   - Capture client information

4. **Add database constraint**:
   - Unique constraint on (user_id, template_id, local_date) to prevent duplicates

## Files to Review Further
- [ ] app/today/page.tsx - All deletion handlers
- [ ] app/components/Calendar.tsx - Calendar deletion logic
- [ ] dayflow/scheduler_main.py - Carry-forward logic
- [ ] Any deduplication or cleanup scripts

## Scripts Created
- `audit-deleted-instances.py` - Shows recently deleted tasks with timing
- `check-sewers-metadata.py` - Shows detailed metadata for specific instances
- `restore-sewers-jan5.py` - Restores the Check sewers instance
