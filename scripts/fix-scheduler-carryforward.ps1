# Fix scheduler carry-forward to schedule carried tasks
# This script patches scheduler_main.py to run schedule_day after carry_forward

$schedulerPath = "C:\Projects\dayflow-scheduler\dayflow\scheduler_main.py"

if (!(Test-Path $schedulerPath)) {
    Write-Error "Scheduler file not found at $schedulerPath"
    exit 1
}

Write-Host "Reading scheduler_main.py..."
$content = Get-Content $schedulerPath -Raw

# Check if already patched
if ($content -match "# Re-schedule carried-forward tasks") {
    Write-Host "Already patched!" -ForegroundColor Green
    exit 0
}

# Find the carry_forward call and add a second schedule_day call after it
$oldPattern = @'
    # 5) Carry forward incomplete one-off or eligible repeating floaters
    carry_forward_incomplete_one_offs(run_date=run_date, supabase=sb)

    return 0
'@

$newPattern = @'
    # 5) Carry forward incomplete one-off or eligible repeating floaters
    carry_forward_incomplete_one_offs(run_date=run_date, supabase=sb)

    # Re-schedule carried-forward tasks (they were inserted with null times)
    logging.info("Re-scheduling carried-forward floating tasks...")
    df_carried = preprocess_recurring_tasks(
        templates_df=templates_df,
        today=run_date,
        supabase=sb,
        user_id=user_id
    )
    if not df_carried.empty:
        # Filter to only tasks that don't have start_time yet (the carried ones)
        resp = sb.table("scheduled_tasks").select("*")\
            .eq("local_date", run_date.isoformat())\
            .eq("user_id", user_id)\
            .is_("start_time", "null")\
            .execute()
        unscheduled = resp.data or []
        if unscheduled:
            logging.info(f"Found {len(unscheduled)} unscheduled carried tasks, running schedule_day...")
            # Build a minimal DataFrame from unscheduled tasks
            import pandas as pd
            unsch_df = pd.DataFrame(unscheduled)
            count_placed = schedule_day(
                tasks_df=unsch_df,
                sb=sb,
                today=run_date,
                force_replace=True
            )
            logging.info(f"Placed {count_placed} carried-forward tasks.")

    return 0
'@

Write-Host "Applying patch..."
$newContent = $content -replace [regex]::Escape($oldPattern), $newPattern

if ($newContent -eq $content) {
    Write-Error "Pattern not found! Scheduler code may have changed."
    Write-Host "Looking for: $oldPattern"
    exit 1
}

Write-Host "Writing patched file..."
$newContent | Set-Content $schedulerPath -NoNewline

Write-Host "✅ Patch applied successfully!" -ForegroundColor Green
Write-Host "Run 'Recreate Schedule' to test the fix."
