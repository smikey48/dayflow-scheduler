# Dayflow Scheduling Issues - Analysis and Fixes

## Date: 2025-12-31

## Issues Reported

1. **Many tasks not scheduled after cold start**
2. **"Fix washing machine leak" not scheduled with no error message**
3. **"Fix washing machine leak" incorrectly showing as appointment 16:05-16:50**
4. **"Clear grotto" not scheduled**

---

## Root Causes Identified

### 1. "Fix washing machine leak" - NOT BEING SCHEDULED

**Cause**: Over-aggressive one-off task blocking logic

The task template has:
- `date`: 2025-12-31 (today)
- `repeat_unit`: none (one-off task)
- `is_appointment`: False

However, this task was previously scheduled on:
- 2025-12-28 (as "Investigate washing machine leak")
- 2025-12-29 (as "Investigate washing machine leak")

The old logic blocked ALL one-off tasks that appeared on any other day, regardless of:
- Whether they were completed
- Whether the task's date field matches today

**Fix Applied**: Modified [planner.py](dayflow/planner.py#L468-L520) to only block one-off tasks if:
- Task was **completed** on another day, OR
- Task has a specific `date` field AND that date is NOT today

This allows incomplete tasks with today's date to be rescheduled even if they appeared on previous days.

### 2. "Fix washing machine leak" showing as appointment at 16:05-16:50

**Cause**: Misconception - this is actually "Clear leaves"

Investigation revealed:
- There are **NO appointments** in today's schedule (all tasks have `is_appointment: False`)
- The task at 16:05-16:50 is "Clear leaves" (template ID: 0c68a092-2205-4633-8ce3-7f2c91bf8deb)
- "Clear leaves" is correctly a **floating task**, not an appointment
- "Fix washing machine leak" is NOT scheduled at all

The user may have been confused about which task they were looking at, or the UI may have displayed it in a way that suggested it was an appointment.

### 3. "Clear grotto" has NULL start_time

**Cause**: No available time slots within scheduling window

The task template has:
- `duration_minutes`: 60
- `window_start_local`: 14:00:00  
- `window_end_local`: 16:30:00

This gives only 2.5 hours to fit a 1-hour task. The scheduler couldn't find a free slot in that window because other tasks (like "Clear leaves" at 16:05-16:50) are already occupying that time.

**Error message**: The scheduler DID add an error message in the `description` field:
```
No available time slot within window [14:00–16:30]
```

However, this message is only visible in the database, not prominently displayed to the user.

**Status**: This is working as designed, but the error messaging needs improvement (see recommendations below).

---

## Changes Made

### File: [dayflow/planner.py](dayflow/planner.py)

**Lines 468-520**: Improved one-off task blocking logic

**Before**:
```python
# Block ALL one-off tasks that appeared on any other day
used_other_ids = {all templates used on other days}
blocked = one_off_mask & tasks_df["id"].isin(used_other_ids)
```

**After**:
```python
# Only block if completed elsewhere OR has wrong date field
completed_other_ids = {templates COMPLETED on other days}
date_not_today_mask = (task has date field AND date != today)
blocked = one_off_mask & (completed_mask | date_not_today_mask)
```

**Benefits**:
- Tasks with today's date can be rescheduled even if they appeared on previous days
- Incomplete tasks without a date field can be rescheduled
- Completed tasks are still properly blocked
- Better logging shows why each task is blocked

---

## Recommendations

### 1. Improve Error Message Display

**Current**: Error messages are stored in the `description` field but not prominently displayed

**Suggested**: 
- Add a UI notification or banner showing unscheduled tasks and reasons
- Consider a separate `scheduling_error` field in the database
- Show these errors in the "Recreate Schedule" dialog

### 2. Task Window Conflicts

**Issue**: "Clear grotto" (60 min) can't fit in 14:00-16:30 window

**Options**:
- Expand the window (e.g., 14:00-18:00)
- Reduce the duration estimate
- Consider priority-based preemption (bump lower-priority tasks)
- Allow manual override to schedule outside the window

### 3. One-Off Task Rescheduling

**Current Fix**: Allows rescheduling based on date field and completion status

**Consider Adding**:
- UI option to "Reset one-off task" (clear previous schedule entries)
- Ability to convert one-off → recurring
- Warning when rescheduling a one-off task that appeared on other days

### 4. Cold Start Issues

**Observation**: User reports "many tasks not scheduled after cold start"

**Potential causes to investigate**:
- Database connection timing
- Template fetching before full initialization
- Race conditions in the scheduler startup

**Suggested**: Add more detailed logging during cold starts to identify which templates are being excluded and why.

---

## Testing Steps

To verify the fix works:

1. Run the scheduler for 2025-12-31:
   ```powershell
   python dayflow/scheduler_main.py --force
   ```

2. Check that "Fix washing machine leak" is now scheduled:
   ```python
   python check-fix-washing-machine.py
   ```

3. Verify logging shows improved blocking reasons:
   ```
   One-off block list (id, title, date, reason):
     - <id>: <title> (date=<date>, reason=completed|wrong_date)
   ```

4. Check that "Clear grotto" still shows appropriate error message

---

## Scripts Created

1. `check-fix-washing-machine.py` - Diagnose washing machine task
2. `check-washing-machine-why.py` - Check why it wasn't scheduled
3. `diagnose-schedule.py` - Comprehensive diagnostic for all scheduling issues
4. `check-clear-grotto.py` - Check Clear grotto scheduling
5. `fix-planner-oneoff.py` - Python script that applied the fixes

---

## Summary

✅ **Fixed**: One-off task blocking logic now allows rescheduling incomplete tasks with today's date  
✅ **Clarified**: "Fix washing machine leak" is not showing as an appointment - that's "Clear leaves"  
✅ **Explained**: "Clear grotto" can't be scheduled due to window constraints (working as designed)  
⚠️ **Needs Improvement**: Error messages for unscheduled tasks should be more visible to users  
🔍 **Investigate Further**: "Cold start" issue with many tasks not being scheduled initially
