param(
    [int]$Port = 8000,
    [string]$Host = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
$RequirementsFile = Join-Path $RepoRoot "requirements.txt"

$pythonCmd = $null
foreach ($candidate in @("python", "python3", "py")) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
        $pythonCmd = $candidate
        break
    }
}

if (-not $pythonCmd) {
    Write-Error "Python is not installed or not available on PATH."
    exit 1
}

Write-Host "Using Python: $pythonCmd"

if (Test-Path $RequirementsFile) {
    Write-Host "Installing dependencies from requirements.txt ..."
    & $pythonCmd -m pip install -r $RequirementsFile
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install requirements."
    }
} else {
    Write-Host "No requirements.txt found. Skipping dependency install."
}

Write-Host "Starting server at http://${Host}:$Port"
Set-Location $RepoRoot
& $pythonCmd -m http.server $Port --bind $Host
exit $LASTEXITCODE
