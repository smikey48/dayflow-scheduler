# Critical Bug Fix: Task Template Incorrectly Deleted When Skipping Instances

## Date: January 7, 2026

## Issue Summary
The "Antonia" task template (a weekly appointment) was incorrectly marked as `is_deleted=true` on December 24, 2025, causing it to disappear from all future schedules including today's (2026-01-07).

## Root Cause
Found critical bug in `app/today/page.tsx` in the `deleteTask()` function (lines 611-630).

### The Bug
When a user clicked "Skip" to skip only the current instance of a recurring task:
1. If the task hadn't been scheduled in the database yet (future instance with ID format `template-{uuid}`)
2. The function would **always delete the entire template**, regardless of the `deleteTemplate` parameter
3. This ignored the user's intention to skip only one instance

### Code Before Fix
```typescript
// Check if this is a template-sourced task (ID starts with "template-")
if (scheduledTaskId.startsWith('template-')) {
  // Extract template ID
  const templateId = scheduledTaskId.replace('template-', '');
  
  // ❌ BUG: Always deletes template, ignores deleteTemplate parameter
  console.log(`[AUDIT] Today page deleteTask deleting template: ${templateId} at ${new Date().toISOString()}`);
  
  // Soft-delete the template
  const { error: templateError } = await supabase
    .from('task_templates')
    .update({ is_deleted: true })
    .eq('id', templateId);
  
  // ... rest of code
}
```

### Code After Fix
```typescript
// Check if this is a template-sourced task (ID starts with "template-")
if (scheduledTaskId.startsWith('template-')) {
  // Extract template ID
  const templateId = scheduledTaskId.replace('template-', '');
  
  // ✅ FIX: Only delete template if deleteTemplate is true
  if (deleteTemplate) {
    console.log(`[AUDIT] Today page deleteTask deleting template: ${templateId} at ${new Date().toISOString()}`);
    
    // Soft-delete the template
    const { error: templateError } = await supabase
      .from('task_templates')
      .update({ is_deleted: true })
      .eq('id', templateId);

    if (templateError) {
      console.error('Failed to delete template:', templateError);
      setError(`Failed to delete template: ${templateError.message}`);
      return;
    }
  } else {
    // ✅ NEW: Skip this instance only - create a deleted record for today
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      return;
    }
    
    // Get today's date and template details, then create a deleted record
    // This marks only today's instance as skipped without affecting the template
    // ... (full implementation in the code)
  }
}
```

## Actions Taken

### 1. Restored the Antonia Task (Immediate Fix)
- Identified template ID: `6da2dd7a-d937-44c6-9ef5-5dd955fdd739`
- Set `is_deleted` back to `false`
- Confirmed: Last deleted on 2025-12-24 at 09:00:46

### 2. Fixed the Bug (Permanent Fix)
- Updated `app/today/page.tsx` deleteTask() function
- Now correctly respects the `deleteTemplate` parameter
- When `deleteTemplate=false`, creates a deletion record for today only
- When `deleteTemplate=true`, still deletes the entire template (with confirmation)

### 3. Regenerated Today's Schedule
- Ran scheduler with user ID `3c877140-9539-47b9-898a-45eeab392e39`
- Confirmed Antonia is now in today's schedule (2026-01-07)
- Task scheduled for 10:00 AM as expected

## Verification
```
Task Template Status:
  - ID: 6da2dd7a-d937-44c6-9ef5-5dd955fdd739
  - Title: Antonia
  - Is Deleted: False ✅
  - Repeat: Weekly on Tuesday
  - Start Time: 10:00

Today's Schedule (2026-01-07):
  - Antonia scheduled ✅
  - Not deleted ✅
  - Not completed ✅
```

## Impact
- **Severity**: Critical - Caused appointments to disappear from schedule
- **Duration**: December 24, 2025 to January 7, 2026
- **Affected Tasks**: Any recurring task where user clicked "Skip" button on a future instance
- **Resolution**: Complete - Bug fixed, task restored, schedule regenerated

## Prevention
- The fix ensures the `deleteTemplate` parameter is always respected
- User confirmations remain in place for template deletion
- Created audit logs to track template deletions

## Files Modified
1. `app/today/page.tsx` - Fixed deleteTask() function (lines 593-690)

## Related Tasks
This is the second occurrence of this type of issue. The first was with another task. The common pattern is:
- User clicks "Skip" on a recurring task
- Task template gets deleted instead of just skipping the instance
- Need to verify if there are other similar bugs in Calendar.tsx or other deletion paths
