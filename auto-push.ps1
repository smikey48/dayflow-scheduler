# Auto-push script - Run this in a separate terminal
# Usage: .\auto-push.ps1

Write-Host "Auto-push enabled. Watching for changes..." -ForegroundColor Green
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
        
        # Push to GitHub
        git push origin main
        
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Pushed to GitHub" -ForegroundColor Green
    }
    
    # Wait 30 seconds before checking again
    Start-Sleep -Seconds 30
}
