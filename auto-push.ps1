# Auto-push script for dayflow-scheduler
# Usage: .\auto-push.ps1

Write-Host "Auto-push enabled for dayflow-scheduler. Watching for changes..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow

while ($true) {
    # Check for changes
    $status = git status --porcelain
    
    if ($status) {
        Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] Changes detected" -ForegroundColor Cyan
        
        # Stage all changes
        git add .
        
        # Commit with timestamp
        $message = "Auto-commit: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        git commit -m $message
        
        # Try to push
        $pushResult = git push origin main 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Push rejected, syncing..." -ForegroundColor Yellow
            
            # Pull with strategy to prefer local changes
            git pull origin main --no-rebase --strategy-option=ours 2>&1 | Out-Null
            
            # Try push again
            git push origin main
        }
        
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Pushed to GitHub" -ForegroundColor Green
    }
    
    # Wait 30 seconds before checking again
    Start-Sleep -Seconds 30
}
