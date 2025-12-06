# Setup Cloudflare Tunnel for DayFlow Remote Access
# This allows you to access your DayFlow instance from anywhere securely

$ErrorActionPreference = "Stop"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "DayFlow Cloudflare Tunnel Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if cloudflared is installed
$cloudflaredPath = "C:\Program Files\cloudflared\cloudflared.exe"
if (-not (Test-Path $cloudflaredPath)) {
    Write-Host "Cloudflared not found. Installing..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please follow these steps:" -ForegroundColor Green
    Write-Host "1. Go to: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/" -ForegroundColor White
    Write-Host "2. Download the Windows installer" -ForegroundColor White
    Write-Host "3. Run the installer" -ForegroundColor White
    Write-Host "4. Run this script again" -ForegroundColor White
    Write-Host ""
    Write-Host "OR install via winget:" -ForegroundColor Green
    Write-Host "  winget install --id Cloudflare.cloudflared" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "✓ Cloudflared is installed" -ForegroundColor Green
Write-Host ""

# Check if already authenticated
$configPath = "$env:USERPROFILE\.cloudflared"
if (-not (Test-Path "$configPath\cert.pem")) {
    Write-Host "First-time setup: You need to authenticate with Cloudflare..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Running authentication (this will open your browser)..." -ForegroundColor Cyan
    & $cloudflaredPath tunnel login
    Write-Host ""
    Write-Host "✓ Authentication complete" -ForegroundColor Green
} else {
    Write-Host "✓ Already authenticated with Cloudflare" -ForegroundColor Green
}

Write-Host ""

# Create tunnel if it doesn't exist
$tunnelName = "dayflow"
Write-Host "Checking for existing tunnel..." -ForegroundColor Cyan

$existingTunnel = & $cloudflaredPath tunnel list | Select-String -Pattern $tunnelName
if (-not $existingTunnel) {
    Write-Host "Creating tunnel '$tunnelName'..." -ForegroundColor Yellow
    & $cloudflaredPath tunnel create $tunnelName
    Write-Host "✓ Tunnel created" -ForegroundColor Green
} else {
    Write-Host "✓ Tunnel '$tunnelName' already exists" -ForegroundColor Green
}

Write-Host ""

# Get tunnel info
Write-Host "Getting tunnel information..." -ForegroundColor Cyan
$tunnelInfo = & $cloudflaredPath tunnel info $tunnelName
Write-Host $tunnelInfo
Write-Host ""

# Create config file
$configFile = "$configPath\config.yml"
Write-Host "Creating config file: $configFile" -ForegroundColor Cyan

$configContent = @"
tunnel: $tunnelName
credentials-file: $configPath\$tunnelName.json

ingress:
  - hostname: dayflow.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
"@

$configContent | Out-File -FilePath $configFile -Encoding UTF8 -Force
Write-Host "✓ Config file created" -ForegroundColor Green
Write-Host ""

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Go to Cloudflare Zero Trust dashboard:" -ForegroundColor Green
Write-Host "   https://one.dash.cloudflare.com/" -ForegroundColor White
Write-Host ""
Write-Host "2. Navigate to: Access > Tunnels" -ForegroundColor Green
Write-Host ""
Write-Host "3. Find your '$tunnelName' tunnel and configure a public hostname:" -ForegroundColor Green
Write-Host "   - Choose a subdomain (e.g., dayflow.yourusername.workers.dev)" -ForegroundColor White
Write-Host "   - Or use your own domain" -ForegroundColor White
Write-Host "   - Point it to: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "4. Start the tunnel:" -ForegroundColor Green
Write-Host "   cloudflared tunnel run $tunnelName" -ForegroundColor White
Write-Host ""
Write-Host "5. Or install as a Windows service to run automatically:" -ForegroundColor Green
Write-Host "   cloudflared service install" -ForegroundColor White
Write-Host ""
Write-Host "Then access DayFlow from anywhere at your configured URL!" -ForegroundColor Yellow
Write-Host ""
