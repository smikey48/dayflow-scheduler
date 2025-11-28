# PowerShell script to patch dayflow/scheduler_main.py
# Adds logic to re-schedule carried-forward tasks after carry_forward runs
# Version 2: Simpler, more targeted fix

$ErrorActionPreference = "Stop"

$schedulerPath = "C:\Projects\dayflow-scheduler\dayflow\scheduler_main.py"

if (-not (Test-Path $schedulerPath)) {
    Write-Host "❌ scheduler_main.py not found at: $schedulerPath" -ForegroundColor Red
    exit 1
}

Write-Host "📝 Patching scheduler_main.py to fix carry-forward scheduling..." -ForegroundColor Cyan

$content = Get-Content $schedulerPath -Raw

# 1. First ensure pandas is imported at the start of main() function
if ($content -notmatch 'def main\(\) -> int:\s+_assert_required_env\(\)[^\n]*\n\s+import pandas as pd') {
    Write-Host "Adding pandas import to main() function..." -ForegroundColor Yellow
    $content = $content -replace '(def main\(\) -> int:\r?\n    _assert_required_env\(\))', '$1' + "`r`n    import pandas as pd"
}

# 2. Add the re-scheduling logic after carry_forward call
# Find the pattern and replace
$findPattern = '    # 5\) Carry forward incomplete one-off or eligible repeating floaters\r?\n    carry_forward_incomplete_one_offs\(run_date=run_date, supabase=sb\)\r?\n\r?\n    return 0'

$replaceWith = @'
    # 5) Carry forward incomplete one-off or eligible repeating floaters
    carry_forward_incomplete_one_offs(run_date=run_date, supabase=sb)

    # 6) Re-schedule carried-forward tasks (they were inserted with null times)
    if sb is not None and args.user:
        logging.info("Re-scheduling carried-forward floating tasks...")
        resp = sb.table("scheduled_tasks").select("*")\
            .eq("local_date", run_date.isoformat())\
            .eq("user_id", args.user)\
            .is_("start_time", "null")\
            .execute()
        unscheduled = resp.data or []
        if unscheduled:
            logging.info(f"Found {len(unscheduled)} unscheduled carried tasks, running schedule_day...")
            carried_df = pd.DataFrame(unscheduled)
            schedule_day(
                tasks_df=carried_df,
                day_start=day_start,
                day_end=day_end,
                supabase=sb,
                user_id=args.user,
                whitelist_template_ids=whitelist_ids,
                dry_run=effective_dry_run,
            )
            logging.info(f"Re-scheduled {len(unscheduled)} carried-forward task(s).")
        else:
            logging.info("No unscheduled carried tasks found.")

    return 0
'@

if ($content -match [regex]::Escape($findPattern)) {
    $content = $content -replace [regex]::Escape($findPattern), $replaceWith
    Set-Content -Path $schedulerPath -Value $content -NoNewline
    Write-Host "✅ Patch applied successfully!" -ForegroundColor Green
    Write-Host "Run 'Recreate Schedule' to test the fix." -ForegroundColor Yellow
} else {
    Write-Host "❌ Could not find the carry_forward pattern. File may have changed." -ForegroundColor Red
    Write-Host "Looking for pattern:" -ForegroundColor Yellow
    Write-Host $findPattern -ForegroundColor Gray
    exit 1
}
