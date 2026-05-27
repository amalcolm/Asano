$ErrorActionPreference = "Stop"

$ProjectDir = Join-Path $PSScriptRoot "Caldera"
$Url = "http://localhost:5174/"

function Test-SiteUp {
    try {
        $response = Invoke-WebRequest `
            -Uri $Url `
            -UseBasicParsing `
            -TimeoutSec 2

        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
    }
    catch {
        return $false
    }
}

if (Test-SiteUp) {
    Write-Host "Caldera is already running at $Url"
    exit 0
}

Write-Host "Starting Caldera dev server..."

Start-Process powershell `
    -WorkingDirectory $ProjectDir `
    -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", "npm run dev"
    )

Start-Sleep -Seconds 2

if (Test-SiteUp) {
    Write-Host "Caldera started at $Url"
}
else {
    Write-Host "Caldera was started, but is not responding yet at $Url"
}