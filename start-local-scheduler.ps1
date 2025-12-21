# Start Local Scheduler for Development
# This runs the Python scheduler server at http://localhost:8000

$ErrorActionPreference = "Stop"

Write-Host "Starting DayFlow Local Scheduler..." -ForegroundColor Cyan

# Check if Python is available
try {
    $pythonVersion = python --version 2>&1
    Write-Host "Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "Python not found. Please restart PowerShell after installing Python." -ForegroundColor Red
    exit 1
}

# Install dependencies if needed
Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
python -m pip install --quiet -r requirements.txt

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host "Dependencies installed" -ForegroundColor Green

# Load environment variables from .env.local
Write-Host "Loading environment from .env.local..." -ForegroundColor Yellow

if (Test-Path .env.local) {
    Get-Content .env.local | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.+)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Item -Path "env:$name" -Value $value
        }
    }
    
    # Also set SUPABASE_SERVICE_KEY for backward compatibility
    if ($env:SUPABASE_SERVICE_ROLE_KEY) {
        $env:SUPABASE_SERVICE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY
    }
    
    Write-Host "Environment loaded" -ForegroundColor Green
    Write-Host "SUPABASE_URL: $($env:SUPABASE_URL -ne $null)" -ForegroundColor Gray
    Write-Host "SUPABASE_SERVICE_KEY: $($env:SUPABASE_SERVICE_KEY -ne $null)" -ForegroundColor Gray
} else {
    Write-Host ".env.local not found" -ForegroundColor Red
    exit 1
}

# Start the Flask server
Write-Host ""
Write-Host "Starting scheduler server on http://localhost:8000" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

python railway_server.py
